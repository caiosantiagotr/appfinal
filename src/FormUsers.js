import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput, 
  ActivityIndicator, 
  ScrollView,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image
} from 'react-native';
import { api } from './api';
import { signOut } from 'firebase/auth';
import { auth, db } from './FirebaseConnection';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons';

export function FormUsers({ navigation }) {
  const [formData, setFormData] = useState({
    nome: "",
    idade: "",
    cargo: "",
    telefone: "",
    email: "",
    cep: "",
    rua: "",
    bairro: "",
    numero: "",
    complemento: "",
    cidade: "",
    estado: "",
  });

  // Estado para controlar erros específicos de cada campo
  const [fieldErrors, setFieldErrors] = useState({
    nome: "",
    idade: "",
    cargo: "",
    telefone: "",
    email: "",
    cep: "",
    numero: "",
    cidade: "",
    estado: ""
  });

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Função para validar campo específico
  const validateField = (field, value) => {
    switch (field) {
      case 'nome':
        if (!value.trim()) return "Nome é obrigatório";
        if (value.trim().length < 3) return "Nome deve ter pelo menos 3 caracteres";
        if (!/^[A-Za-záàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ ]+$/.test(value)) 
          return "Nome deve conter apenas letras";
        return "";
        
      case 'idade':
        if (!value) return "Idade é obrigatória";
        const idade = parseInt(value);
        if (isNaN(idade)) return "Idade deve ser um número";
        if (idade < 18) return "Idade mínima é 18 anos";
        if (idade > 120) return "Idade inválida";
        return "";
        
      case 'cargo':
        if (!value.trim()) return "Cargo é obrigatório";
        if (value.trim().length < 2) return "Cargo deve ter pelo menos 2 caracteres";
        return "";
        
      case 'telefone':
        if (!value.trim()) return "Telefone é obrigatório";
        if (!/^\d{10,11}$/.test(value.replace(/\D/g, ''))) 
          return "Telefone deve ter entre 10 e 11 dígitos";
        return "";
        
      case 'email':
        if (!value.trim()) return "Email é obrigatório";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) 
          return "Email inválido";
        return "";
        
      case 'cep':
        if (!value) return "CEP é obrigatório";
        if (value.length !== 8) return "CEP deve ter 8 dígitos";
        if (!/^\d+$/.test(value)) return "CEP deve conter apenas números";
        return "";
      
      case 'numero':
        if (!value.trim()) return "Número é obrigatório";
        if (!/^\d+$/.test(value) && value !== 'S/N') return "Número deve conter apenas dígitos ou S/N";
        return "";
      
      case 'cidade':
        if (!value.trim()) return "Cidade é obrigatória";
        return "";
        
      case 'estado':
        if (!value.trim()) return "Estado é obrigatório";
        if (value.trim().length !== 2) return "Use a sigla do estado (2 letras)";
        return "";
        
      default:
        return "";
    }
  };

  // Função para atualizar campo e validar em tempo real
  const updateFormField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Validar campo e atualizar erro específico
    const error = validateField(field, value);
    setFieldErrors(prev => ({ ...prev, [field]: error }));
    
    // Limpa a mensagem de erro geral quando o usuário começa a digitar
    if (errorMessage) setErrorMessage("");
  };

  // Função para formatar telefone (XX) XXXXX-XXXX
  const formatPhoneNumber = (phoneNumber) => {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length === 0) return '';
    if (cleaned.length <= 2) return `(${cleaned}`;
    if (cleaned.length <= 7) return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7, 11)}`;
  };

  // Função para validar formulário completo
  const validateForm = () => {
    let isValid = true;
    const newFieldErrors = {};
    
    // Lista de campos obrigatórios
    const requiredFields = ['nome', 'idade', 'cargo', 'telefone', 'email', 'cep', 'numero', 'cidade', 'estado'];
    
    // Validar cada campo obrigatório
    requiredFields.forEach(field => {
      const error = validateField(field, formData[field]);
      newFieldErrors[field] = error;
      
      if (error) isValid = false;
    });
    
    setFieldErrors(newFieldErrors);
    return isValid;
  };

  // Função para buscar o CEP utilizando a API
  async function handleSearchCep() {
    // Validar CEP antes de buscar
    const cepError = validateField('cep', formData.cep);
    if (cepError) {
      setFieldErrors(prev => ({ ...prev, cep: cepError }));
      setErrorMessage(cepError);
      return;
    }

    setCepLoading(true);
    try {
      const data = await api.searchCep(formData.cep);
      if (!data || !data.logradouro) {
        setErrorMessage("CEP não encontrado ou inválido");
        setFieldErrors(prev => ({ ...prev, cep: "CEP não encontrado" }));
      } else {
        setFormData(prev => ({
          ...prev,
          rua: data.logradouro,
          bairro: data.bairro,
          cidade: data.localidade || "",
          estado: data.uf || ""
        }));
        setErrorMessage("");
      }
    } catch (error) {
      console.log("Erro na busca do CEP:", error);
      setErrorMessage(`Erro ao buscar CEP: ${error.message || "Falha na conexão"}`);
      setFieldErrors(prev => ({ ...prev, cep: "Erro ao buscar CEP" }));
    } finally {
      setCepLoading(false);
    }
  }

  // Formatação dos dados antes de enviar ao Firebase
  const prepareDataForSubmission = () => {
    // Construir o endereço completo
    const enderecoCompleto = {
      cep: formData.cep,
      rua: formData.rua,
      numero: formData.numero,
      complemento: formData.complemento,
      bairro: formData.bairro,
      cidade: formData.cidade,
      estado: formData.estado
    };

    return {
      nome: formData.nome.trim(),
      idade: parseInt(formData.idade),
      cargo: formData.cargo.trim(),
      telefone: formData.telefone.replace(/\D/g, ''),
      email: formData.email.trim(),
      endereco: enderecoCompleto,
      createdAt: serverTimestamp()
    };
  };

  // Função para registrar um novo usuário DIRETAMENTE no Firebase
  async function handleRegister() {
    setFormSubmitted(true);
    
    // Validar todos os campos
    if (!validateForm()) {
      setErrorMessage("Corrija os erros no formulário antes de continuar");
      return;
    }

    // Verifica se todos os campos obrigatórios do endereço estão presentes
    if (!formData.rua || !formData.bairro || !formData.numero || !formData.cidade || !formData.estado) {
      setErrorMessage("Todos os campos obrigatórios do endereço devem ser preenchidos");
      return;
    }

    setLoading(true);
    try {
      // Preparar dados para envio
      const dataToSubmit = prepareDataForSubmission();
      
      // Referência à coleção 'usuarios'
      const usersCollection = collection(db, "usuarios");
      
      // Adicionar documento à coleção
      const docRef = await addDoc(usersCollection, dataToSubmit);
      
      console.log("Documento adicionado com ID: ", docRef.id);
      
      // Mostra mensagem de sucesso e reseta o formulário
      setSuccessMessage("Usuário cadastrado com sucesso!");
      setFormData({
        nome: "",
        idade: "",
        cargo: "",
        telefone: "",
        email: "",
        cep: "",
        rua: "",
        bairro: "",
        numero: "",
        complemento: "",
        cidade: "",
        estado: ""
      });
      setFormSubmitted(false);
      setErrorMessage("");
      
      // Mostra uma mensagem de sucesso temporária antes de navegar
      setTimeout(() => {
        setSuccessMessage("");
        navigation.navigate("UsersList");
      }, 2000);
      
    } catch (err) {
      console.log("Erro detalhado ao cadastrar no Firebase:", err);
      
      // Tratamento específico de erros do Firebase
      if (err.code === 'permission-denied') {
        setErrorMessage("Permissão negada. Verifique as regras do Firestore.");
      } else if (err.code === 'unavailable') {
        setErrorMessage("Serviço Firebase indisponível. Verifique sua conexão.");
      } else {
        setErrorMessage(`Erro ao cadastrar: ${err.message || "Erro desconhecido"}`);
      }
    } finally {
      setLoading(false);
    }
  }

  // Função para logout
  async function handleLogout() {
    Alert.alert(
      "Logout",
      "Tem certeza que deseja sair?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sair",
          onPress: async () => {
            try {
              await signOut(auth);
              navigation.navigate('Login');
            } catch (error) {
              console.log("Erro ao fazer logout:", error);
              Alert.alert("Erro", "Não foi possível fazer logout.");
            }
          }
        }
      ]
    );
  }

  // Função para limpar o formulário
  const handleClearForm = () => {
    Alert.alert(
      "Limpar formulário",
      "Deseja limpar todos os campos do formulário?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpar",
          onPress: () => {
            setFormData({
              nome: "",
              idade: "",
              cargo: "",
              telefone: "",
              email: "",
              cep: "",
              rua: "",
              bairro: "",
              numero: "",
              complemento: "",
              cidade: "",
              estado: ""
            });
            setFieldErrors({
              nome: "",
              idade: "",
              cargo: "",
              telefone: "",
              email: "",
              cep: "",
              numero: "",
              cidade: "",
              estado: ""
            });
            setErrorMessage("");
            setFormSubmitted(false);
          }
        }
      ]
    );
  };

  // Função para cancelar e voltar
  const handleCancel = () => {
    Alert.alert(
      "Cancelar cadastro",
      "Deseja cancelar o cadastro e perder os dados preenchidos?",
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim, cancelar",
          onPress: () => {
            navigation.goBack(); // Volta para a tela anterior
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#3498db" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cadastro de Usuário</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <MaterialIcons name="logout" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>
      
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoid}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formContainer}>
            {errorMessage ? (
              <View style={styles.errorContainer}>
                <MaterialIcons name="error-outline" size={20} color="#FFF" />
                <Text style={styles.errorMessage}>{errorMessage}</Text>
              </View>
            ) : null}
            
            {successMessage ? (
              <View style={styles.successContainer}>
                <MaterialIcons name="check-circle" size={20} color="#FFF" />
                <Text style={styles.successMessage}>{successMessage}</Text>
              </View>
            ) : null}
            
            {/* Seção de Dados Pessoais */}
            <View style={styles.sectionHeader}>
              <MaterialIcons name="person" size={24} color="#3498db" />
              <Text style={styles.sectionTitle}>Dados Pessoais</Text>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nome completo <Text style={styles.required}>*</Text></Text>
              <View style={styles.inputWithIcon}>
                <MaterialIcons name="person-outline" size={20} color="#777" style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input,
                    (formSubmitted && !formData.nome) || fieldErrors.nome ? styles.inputError : null
                  ]}
                  placeholder="Digite seu nome completo"
                  value={formData.nome}
                  onChangeText={(text) => updateFormField('nome', text)}
                  maxLength={100}
                  placeholderTextColor="#999"
                />
              </View>
              {((formSubmitted && !formData.nome) || fieldErrors.nome) && (
                <Text style={styles.fieldError}>{fieldErrors.nome || "Nome é obrigatório"}</Text>
              )}
            </View>
            
            <View style={styles.inputRow}>
              <View style={[styles.inputColumn, {flex: 1}]}>
                <Text style={styles.label}>Idade <Text style={styles.required}>*</Text></Text>
                <View style={styles.inputWithIcon}>
                  <MaterialIcons name="event" size={20} color="#777" style={styles.inputIcon} />
                  <TextInput
                    style={[
                      styles.input,
                      (formSubmitted && !formData.idade) || fieldErrors.idade ? styles.inputError : null
                    ]}
                    placeholder="Idade"
                    value={formData.idade}
                    onChangeText={(text) => updateFormField('idade', text)}
                    keyboardType="numeric"
                    maxLength={3}
                    placeholderTextColor="#999"
                  />
                </View>
                {((formSubmitted && !formData.idade) || fieldErrors.idade) && (
                  <Text style={styles.fieldError}>{fieldErrors.idade || "Idade é obrigatória"}</Text>
                )}
              </View>
              
              <View style={[styles.inputColumn, {flex: 2, marginLeft: 12}]}>
                <Text style={styles.label}>Cargo <Text style={styles.required}>*</Text></Text>
                <View style={styles.inputWithIcon}>
                  <MaterialIcons name="work" size={20} color="#777" style={styles.inputIcon} />
                  <TextInput
                    style={[
                      styles.input,
                      (formSubmitted && !formData.cargo) || fieldErrors.cargo ? styles.inputError : null
                    ]}
                    placeholder="Cargo ou função"
                    value={formData.cargo}
                    onChangeText={(text) => updateFormField('cargo', text)}
                    maxLength={50}
                    placeholderTextColor="#999"
                  />
                </View>
                {((formSubmitted && !formData.cargo) || fieldErrors.cargo) && (
                  <Text style={styles.fieldError}>{fieldErrors.cargo || "Cargo é obrigatório"}</Text>
                )}
              </View>
            </View>
            
            {/* Novos campos: Telefone e Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Telefone <Text style={styles.required}>*</Text></Text>
              <View style={styles.inputWithIcon}>
                <MaterialIcons name="phone" size={20} color="#777" style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input,
                    (formSubmitted && !formData.telefone) || fieldErrors.telefone ? styles.inputError : null
                  ]}
                  placeholder="(00) 00000-0000"
                  value={formData.telefone}
                  onChangeText={(text) => {
                    const digitsOnly = text.replace(/\D/g, '');
                    updateFormField('telefone', digitsOnly);
                  }}
                  keyboardType="phone-pad"
                  maxLength={15}
                  placeholderTextColor="#999"
                />
              </View>
              {((formSubmitted && !formData.telefone) || fieldErrors.telefone) && (
                <Text style={styles.fieldError}>{fieldErrors.telefone || "Telefone é obrigatório"}</Text>
              )}
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email <Text style={styles.required}>*</Text></Text>
              <View style={styles.inputWithIcon}>
                <MaterialIcons name="email" size={20} color="#777" style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input,
                    (formSubmitted && !formData.email) || fieldErrors.email ? styles.inputError : null
                  ]}
                  placeholder="exemplo@email.com"
                  value={formData.email}
                  onChangeText={(text) => updateFormField('email', text)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  maxLength={100}
                  placeholderTextColor="#999"
                />
              </View>
              {((formSubmitted && !formData.email) || fieldErrors.email) && (
                <Text style={styles.fieldError}>{fieldErrors.email || "Email é obrigatório"}</Text>
              )}
            </View>
            
            {/* Seção de Endereço */}
            <View style={styles.sectionHeader}>
              <MaterialIcons name="location-on" size={24} color="#3498db" />
              <Text style={styles.sectionTitle}>Endereço</Text>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>CEP <Text style={styles.required}>*</Text></Text>
              <View style={styles.cepContainer}>
                <View style={[styles.inputWithIcon, {flex: 1}]}>
                  <MaterialIcons name="map" size={20} color="#777" style={styles.inputIcon} />
                  <TextInput
                    style={[
                      styles.input,
                      (formSubmitted && !formData.cep) || fieldErrors.cep ? styles.inputError : null
                    ]}
                    placeholder="00000-000"
                    value={formData.cep}
                    onChangeText={(text) => updateFormField('cep', text.replace(/\D/g, ''))}
                    keyboardType="numeric"
                    maxLength={8}
                    placeholderTextColor="#999"
                  />
                </View>
                <TouchableOpacity 
                  style={[
                    styles.cepButton,
                    (!formData.cep || formData.cep.length !== 8 || fieldErrors.cep) ? styles.buttonDisabled : null
                  ]} 
                  onPress={handleSearchCep}
                  disabled={cepLoading || !formData.cep || formData.cep.length !== 8 || !!fieldErrors.cep}
                >
                  {cepLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialIcons name="search" size={18} color="#FFFFFF" style={{marginRight: 4}} />
                      <Text style={styles.cepButtonText}>Buscar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              {((formSubmitted && !formData.cep) || fieldErrors.cep) && (
                <Text style={styles.fieldError}>{fieldErrors.cep || "CEP é obrigatório"}</Text>
              )}
            </View>
            
            {formData.rua ? (
              <>
                <View style={styles.card}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Rua <Text style={styles.required}>*</Text></Text>
                    <View style={styles.inputWithIcon}>
                      <MaterialIcons name="home" size={20} color="#777" style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, styles.disabledInput]}
                        value={formData.rua}
                        editable={false}
                        placeholderTextColor="#999"
                      />
                    </View>
                  </View>
                  
                  <View style={[styles.inputRow, { marginBottom: 16 }]}>
                    <View style={[styles.inputColumn, {flex: 1}]}>
                      <Text style={styles.label}>Número <Text style={styles.required}>*</Text></Text>
                      <View style={styles.inputWithIcon}>
                        <MaterialIcons name="tag" size={20} color="#777" style={styles.inputIcon} />
                        <TextInput
                          style={[
                            styles.input,
                            (formSubmitted && !formData.numero) || fieldErrors.numero ? styles.inputError : null
                          ]}
                          placeholder="Nº ou S/N"
                          value={formData.numero}
                          onChangeText={(text) => updateFormField('numero', text)}
                          keyboardType="default"
                          maxLength={10}
                          placeholderTextColor="#999"
                        />
                      </View>
                      {((formSubmitted && !formData.numero) || fieldErrors.numero) && (
                        <Text style={styles.fieldError}>{fieldErrors.numero || "Número é obrigatório"}</Text>
                      )}
                    </View>
                    
                    <View style={[styles.inputColumn, {flex: 2, marginLeft: 12}]}>
                      <Text style={styles.label}>Complemento</Text>
                      <View style={styles.inputWithIcon}>
                        <MaterialIcons name="more-horiz" size={20} color="#777" style={styles.inputIcon} />
                        <TextInput
                          style={styles.input}
                          placeholder="Opcional"
                          value={formData.complemento}
                          onChangeText={(text) => updateFormField('complemento', text)}
                          maxLength={50}
                          placeholderTextColor="#999"
                        />
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Bairro <Text style={styles.required}>*</Text></Text>
                    <View style={styles.inputWithIcon}>
                      <MaterialIcons name="location-city" size={20} color="#777" style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, styles.disabledInput]}
                        value={formData.bairro}
                        editable={false}
                        placeholderTextColor="#999"
                      />
                    </View>
                  </View>
                  
                  <View style={[styles.inputRow, { marginBottom: 8 }]}>
                    <View style={[styles.inputColumn, { flex: 3 }]}>
                      <Text style={styles.label}>Cidade <Text style={styles.required}>*</Text></Text>
                      <View style={styles.inputWithIcon}>
                        <MaterialIcons name="apartment" size={20} color="#777" style={styles.inputIcon} />
                        <TextInput
                          style={[
                            styles.input,
                            formData.cidade ? styles.disabledInput : null,
                            (formSubmitted && !formData.cidade) || fieldErrors.cidade ? styles.inputError : null
                          ]}
                          placeholder="Cidade"
                          value={formData.cidade}
                          onChangeText={(text) => updateFormField('cidade', text)}
                          editable={!formData.cidade}
                          maxLength={50}
                          placeholderTextColor="#999"
                        />
                      </View>
                      {((formSubmitted && !formData.cidade) || fieldErrors.cidade) && (
                        <Text style={styles.fieldError}>{fieldErrors.cidade || "Cidade é obrigatória"}</Text>
                      )}
                    </View>
                    
                    <View style={[styles.inputColumn, { flex: 1, marginLeft: 12 }]}>
                      <Text style={styles.label}>UF <Text style={styles.required}>*</Text></Text>
                      <View style={styles.inputWithIcon}>
                        <MaterialIcons name="flag" size={20} color="#777" style={styles.inputIcon} />
                        <TextInput
                          style={[
                            styles.input,
                            formData.estado ? styles.disabledInput : null,
                            (formSubmitted && !formData.estado) || fieldErrors.estado ? styles.inputError : null
                          ]}
                          placeholder="UF"
                          value={formData.estado}
                          onChangeText={(text) => updateFormField('estado', text.toUpperCase())}
                          editable={!formData.estado}
                          maxLength={2}
                          placeholderTextColor="#999"
                        />
                      </View>
                      {((formSubmitted && !formData.estado) || fieldErrors.estado) && (
                        <Text style={styles.fieldError}>{fieldErrors.estado || "UF é obrigatória"}</Text>
                      )}
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.addressPlaceholder}>
                <MaterialIcons name="home-work" size={40} color="#ccc" />
                <Text style={styles.addressPlaceholderText}>Informe o CEP para preencher o endereço</Text>
              </View>
            )}
            
            <View style={styles.buttonRow}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={handleCancel}
              >
                <MaterialIcons name="cancel" size={20} color="#FFFFFF" style={styles.buttonIcon} />
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.clearButton} 
                onPress={handleClearForm}
              >
                <MaterialIcons name="clear" size={20} color="#FFFFFF" style={styles.buttonIcon} />
                <Text style={styles.clearButtonText}>Limpar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.submitButton,
                  (loading || !formData.rua || !formData.numero || !formData.cidade || !formData.estado) ? styles.buttonDisabled : null
                ]} 
                onPress={handleRegister}
                disabled={loading || !formData.rua || !formData.numero || !formData.cidade || !formData.estado}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="person-add" size={20} color="#FFFFFF" style={styles.buttonIcon} />
                    <Text style={styles.submitButtonText}>Cadastrar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
          
          <TouchableOpacity 
            style={styles.listButton}
            onPress={() => navigation.navigate('UsersList')}
            activeOpacity={0.8}
          >
            <MaterialIcons name="list" size={22} color="#FFFFFF" style={styles.buttonIcon} />
            <Text style={styles.listButtonText}>Ver Usuários Cadastrados</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f6fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#3498db',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowOpacity: 0.2,
shadowRadius: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  logoutButton: {
    padding: 8,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 24,
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#444',
    marginBottom: 6,
  },
  required: {
    color: '#e74c3c',
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#333',
  },
  disabledInput: {
    backgroundColor: '#f9f9f9',
    color: '#666',
  },
  inputError: {
    borderColor: '#e74c3c',
  },
  fieldError: {
    color: '#e74c3c',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  inputColumn: {
    flex: 1,
  },
  cepContainer: {
    flexDirection: 'row',
  },
  cepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3498db',
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
    height: 48,
  },
  cepButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  buttonDisabled: {
    backgroundColor: '#95a5a6',
    opacity: 0.7,
  },
  addressPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eaeaea',
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  addressPlaceholderText: {
    color: '#777',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eaeaea',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  submitButton: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2ecc71',
    paddingVertical: 12,
    borderRadius: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e74c3c',
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  clearButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f39c12',
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  clearButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonIcon: {
    marginRight: 4,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e74c3c',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorMessage: {
    color: '#FFFFFF',
    marginLeft: 8,
    flex: 1,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2ecc71',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  successMessage: {
    color: '#FFFFFF',
    marginLeft: 8,
    flex: 1,
  },
  listButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3498db',
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  listButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});