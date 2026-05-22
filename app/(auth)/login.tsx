import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const signIn = async () => {
    if (!email || !password) {
      Alert.alert('Please fill in all fields');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Login failed', error.message);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>
            Päivy<Text style={styles.dot}>.</Text>
          </Text>
          <Text style={styles.sub}>Office Manager · Finland</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="you@company.fi"
            placeholderTextColor="#4A6075"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="password"
            placeholderTextColor="#4A6075"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity
            style={styles.btn}
            onPress={signIn}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={styles.btnText}>Sign in</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          No account yet? Ask your manager or HR admin to invite you.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C1520' },
  inner:     { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logo:      { alignItems: 'center', marginBottom: 48 },
  logoText:  { fontSize: 42, fontWeight: '800', color: 'white', letterSpacing: -1 },
  dot:       { color: '#E05C2A' },
  sub:       { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  form:      { backgroundColor: '#162030', borderRadius: 18, padding: 22, marginBottom: 20 },
  label:     { fontSize: 11, fontWeight: '700', color: '#4A6075',
               letterSpacing: 0.5, marginBottom: 6 },
  input:     { backgroundColor: '#0C1520', borderWidth: 1, borderColor: '#1C2E40',
               borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
               fontSize: 15, color: '#C8D8E8', marginBottom: 16 },
  btn:       { backgroundColor: '#E05C2A', borderRadius: 12,
               paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnText:   { color: 'white', fontSize: 15, fontWeight: '700' },
  hint:      { textAlign: 'center', fontSize: 12, color: '#4A6075', lineHeight: 18 },
});