import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { router }   from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function RegisterScreen() {
  const [email,    setEmail]    = useState('');
  const [code,     setCode]     = useState('');
  const [name,     setName]     = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const register = async () => {
    if (!email || !code || !name || !password) {
      Alert.alert('Please fill in all fields'); return;
    }
    if (password.length < 6) {
      Alert.alert('Password must be at least 6 characters'); return;
    }
    setLoading(true);

    // Find invitation matching email + code prefix
    const { data: invites, error: invErr } = await supabase
      .from('invitations')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .is('accepted_at', null);

    if (invErr || !invites || invites.length === 0) {
      setLoading(false);
      Alert.alert('Invalid invite', 'No invitation found for this email address.');
      return;
    }

    const invite = invites.find((i: any) =>
      i.token.toLowerCase().startsWith(code.toLowerCase().trim())
    );

    if (!invite) {
      setLoading(false);
      Alert.alert('Invalid code', 'The invite code does not match. Check with your HR admin.');
      return;
    }

    if (new Date(invite.expires_at) < new Date()) {
      setLoading(false);
      Alert.alert('Expired', 'This invite has expired. Ask HR admin to send a new one.');
      return;
    }

    // Create the account
    const { data: authData, error: signUpErr } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });

    if (signUpErr || !authData.user) {
      setLoading(false);
      Alert.alert('Sign up failed', signUpErr?.message || 'Unknown error');
      return;
    }

    // Update profile with team and role from invitation
    await supabase.from('profiles').update({
      full_name: name.trim(),
      team_id:   invite.team_id,
      role:      invite.role,
    }).eq('id', authData.user.id);

    // Mark invitation as accepted
    await supabase.from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    setLoading(false);
    // Auth state change in useAuth will redirect automatically
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>Päivy<Text style={styles.dot}>.</Text></Text>
          <Text style={styles.sub}>Create your account</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>INVITE CODE</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. a3f9b82c"
            placeholderTextColor="#4A6075"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
          />
          <Text style={styles.label}>YOUR EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="you@company.fi"
            placeholderTextColor="#4A6075"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text style={styles.label}>FULL NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="Matti Meikäläinen"
            placeholderTextColor="#4A6075"
            value={name}
            onChangeText={setName}
          />
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={[styles.input, { marginBottom: 0 }]}
            placeholder="Min. 6 characters"
            placeholderTextColor="#4A6075"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity style={styles.btn} onPress={register} disabled={loading}>
          {loading
            ? <ActivityIndicator color="white" />
            : <Text style={styles.btnText}>Create Account</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backText}>← Back to sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0C1520' },
  scroll:     { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 40 },
  logo:       { alignItems: 'center', marginBottom: 36 },
  logoText:   { fontSize: 38, fontWeight: '800', color: 'white', letterSpacing: -1 },
  dot:        { color: '#E05C2A' },
  sub:        { fontSize: 14, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
  form:       { backgroundColor: '#162030', borderRadius: 18, padding: 22, marginBottom: 16 },
  label:      { fontSize: 11, fontWeight: '700', color: '#4A6075',
                letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input:      { backgroundColor: '#0C1520', borderWidth: 1, borderColor: '#1C2E40',
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                fontSize: 15, color: '#C8D8E8', marginBottom: 4 },
  btn:        { backgroundColor: '#E05C2A', borderRadius: 12,
                paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  btnText:    { color: 'white', fontSize: 15, fontWeight: '700' },
  backLink:   { alignItems: 'center' },
  backText:   { color: '#4A6075', fontSize: 14 },
});