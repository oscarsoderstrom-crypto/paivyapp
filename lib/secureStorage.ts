import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as aesjs from 'aes-js';
import { Platform } from 'react-native';

// Supabase persists the whole session — access token, refresh token and the
// user object — under a single key. That payload routinely exceeds the
// 2048-byte limit of expo-secure-store, so we follow Supabase's documented
// "LargeSecureStore" pattern: a random AES-256 key is kept in the device
// keychain (SecureStore) while the encrypted session blob lives in
// AsyncStorage. The plaintext session token never touches disk unencrypted.
class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = Crypto.getRandomBytes(256 / 8);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      const decrypted = await this.decrypt(key, encrypted);
      // No key in the keychain means a legacy plaintext value (or a wiped
      // keychain): drop it so the user is asked to sign in again cleanly.
      if (decrypted === null) await this.removeItem(key);
      return decrypted;
    } catch {
      await this.removeItem(key);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

// SecureStore is unavailable on web, where AsyncStorage falls back to
// localStorage — the standard Supabase web persistence layer.
export const sessionStorage =
  Platform.OS === 'web' ? AsyncStorage : new LargeSecureStore();
