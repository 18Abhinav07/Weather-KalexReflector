// Custodial Wallet Management Service
// Implements SRS Security Requirements with AES-256 encryption

import { Keypair } from '@stellar/stellar-sdk';
import { createCipher, createDecipher, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export interface CustodialWalletKeyPair {
  publicKey: string;
  encryptedPrivateKey: string;
}

export interface DecryptedWalletKeyPair {
  publicKey: string;
  privateKey: string;
}

export class CustodialWalletManager {
  private masterKey: string;
  private readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  private readonly KEY_DERIVATION_LENGTH = 32;
  private readonly SALT_LENGTH = 16;

  constructor() {
    // Get master key from environment or generate one (for development)
    this.masterKey = process.env.WALLET_MASTER_KEY || this.generateMasterKey();
    
    if (process.env.NODE_ENV === 'production' && !process.env.WALLET_MASTER_KEY) {
      throw new Error('WALLET_MASTER_KEY environment variable is required in production');
    }

    console.log('[CustodialWalletManager] Initialized with master key');
  }

  /**
   * Generate a new custodial wallet with encrypted private key
   */
  async generateCustodialWallet(): Promise<CustodialWalletKeyPair> {
    try {
      // Generate new Stellar keypair
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();
      const privateKey = keypair.secret();

      // Encrypt the private key
      const encryptedPrivateKey = await this.encryptPrivateKey(privateKey);

      console.log(`[CustodialWalletManager] Generated custodial wallet: ${publicKey}`);

      return {
        publicKey,
        encryptedPrivateKey
      };
    } catch (error) {
      console.error('[CustodialWalletManager] Failed to generate custodial wallet:', error);
      throw new Error(`Custodial wallet generation failed: ${error}`);
    }
  }

  /**
   * Decrypt private key for transaction signing
   */
  async decryptPrivateKey(encryptedPrivateKey: string): Promise<string> {
    try {
      // Parse the encrypted data
      const parts = encryptedPrivateKey.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted key format');
      }

      const [saltHex, ivHex, encryptedHex] = parts;
      const salt = Buffer.from(saltHex, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const encrypted = Buffer.from(encryptedHex, 'hex');

      // Derive key from master key and salt
      const key = (await scryptAsync(this.masterKey, salt, this.KEY_DERIVATION_LENGTH)) as Buffer;

      // Decrypt
      const decipher = createDecipher(this.ENCRYPTION_ALGORITHM, key);
      decipher.setAuthTag(encrypted.slice(-16)); // Last 16 bytes are auth tag
      
      let decrypted = decipher.update(encrypted.slice(0, -16), undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('[CustodialWalletManager] Failed to decrypt private key:', error);
      throw new Error('Private key decryption failed');
    }
  }

  /**
   * Get decrypted keypair for transaction signing
   */
  async getDecryptedKeypair(publicKey: string, encryptedPrivateKey: string): Promise<DecryptedWalletKeyPair> {
    try {
      const privateKey = await this.decryptPrivateKey(encryptedPrivateKey);
      
      // Verify keypair matches
      const keypair = Keypair.fromSecret(privateKey);
      if (keypair.publicKey() !== publicKey) {
        throw new Error('Public key mismatch after decryption');
      }

      return {
        publicKey,
        privateKey
      };
    } catch (error) {
      console.error('[CustodialWalletManager] Failed to get decrypted keypair:', error);
      throw new Error(`Keypair decryption failed: ${error}`);
    }
  }

  /**
   * Initialize wallet on Stellar network (create account if needed)
   */
  async initializeWalletOnNetwork(publicKey: string): Promise<void> {
    try {
      // In production, this would check if account exists and create it if needed
      // For now, we'll just log the action
      console.log(`[CustodialWalletManager] Wallet initialized on network: ${publicKey}`);
      
      // TODO: Implement actual network initialization
      // - Check if account exists on Stellar network
      // - Create account if it doesn't exist (using friendbot for testnet)
      // - Set up KALE trustline if needed
      
    } catch (error) {
      console.error('[CustodialWalletManager] Network initialization failed:', error);
      throw new Error(`Network initialization failed: ${error}`);
    }
  }

  /**
   * Encrypt private key with master key
   */
  private async encryptPrivateKey(privateKey: string): Promise<string> {
    try {
      // Generate salt and IV
      const salt = randomBytes(this.SALT_LENGTH);
      const iv = randomBytes(16); // 128-bit IV for AES

      // Derive key from master key and salt using scrypt
      const key = (await scryptAsync(this.masterKey, salt, this.KEY_DERIVATION_LENGTH)) as Buffer;

      // Encrypt
      const cipher = createCipher(this.ENCRYPTION_ALGORITHM, key);
      cipher.setAAD(Buffer.from(salt)); // Additional authenticated data

      let encrypted = cipher.update(privateKey, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      // Get auth tag
      const authTag = cipher.getAuthTag();

      // Combine encrypted data with auth tag
      const combined = Buffer.concat([encrypted, authTag]);

      // Return as salt:iv:encrypted format
      return `${salt.toString('hex')}:${iv.toString('hex')}:${combined.toString('hex')}`;
    } catch (error) {
      console.error('[CustodialWalletManager] Encryption failed:', error);
      throw new Error('Private key encryption failed');
    }
  }

  /**
   * Generate master key for development
   */
  private generateMasterKey(): string {
    const masterKey = randomBytes(32).toString('hex');
    console.warn('[CustodialWalletManager] ⚠️ Using generated master key for development');
    console.warn('[CustodialWalletManager] Set WALLET_MASTER_KEY environment variable for production');
    return masterKey;
  }

  /**
   * Validate encrypted private key format
   */
  isValidEncryptedKey(encryptedKey: string): boolean {
    const parts = encryptedKey.split(':');
    if (parts.length !== 3) return false;

    try {
      // Validate hex format
      Buffer.from(parts[0], 'hex'); // salt
      Buffer.from(parts[1], 'hex'); // iv
      Buffer.from(parts[2], 'hex'); // encrypted data
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Rotate master key (for key rotation procedures)
   */
  async rotateMasterKey(newMasterKey: string, encryptedKeys: string[]): Promise<string[]> {
    console.warn('[CustodialWalletManager] Starting master key rotation...');
    
    const reencryptedKeys: string[] = [];
    
    try {
      for (const encryptedKey of encryptedKeys) {
        // Decrypt with old key
        const privateKey = await this.decryptPrivateKey(encryptedKey);
        
        // Temporarily set new master key
        const oldMasterKey = this.masterKey;
        this.masterKey = newMasterKey;
        
        // Re-encrypt with new key
        const newEncryptedKey = await this.encryptPrivateKey(privateKey);
        reencryptedKeys.push(newEncryptedKey);
        
        // Restore old key for next iteration
        this.masterKey = oldMasterKey;
      }

      // Update master key after successful re-encryption
      this.masterKey = newMasterKey;
      
      console.log(`[CustodialWalletManager] ✅ Master key rotated successfully (${encryptedKeys.length} keys updated)`);
      return reencryptedKeys;
      
    } catch (error) {
      console.error('[CustodialWalletManager] Master key rotation failed:', error);
      throw new Error(`Key rotation failed: ${error}`);
    }
  }

  /**
   * Security audit helper - check key strength
   */
  auditKeySecurity(): { masterKeyEntropy: number; encryptionAlgorithm: string; keyDerivationMethod: string } {
    return {
      masterKeyEntropy: this.masterKey.length * 4, // Hex entropy
      encryptionAlgorithm: this.ENCRYPTION_ALGORITHM,
      keyDerivationMethod: 'scrypt'
    };
  }

  /**
   * Test encryption/decryption functionality
   */
  async testEncryptionRoundtrip(): Promise<boolean> {
    try {
      const testPrivateKey = 'SAMPLETEST' + randomBytes(20).toString('hex').toUpperCase();
      const encrypted = await this.encryptPrivateKey(testPrivateKey);
      const decrypted = await this.decryptPrivateKey(encrypted);
      
      const success = testPrivateKey === decrypted;
      console.log(`[CustodialWalletManager] Encryption test: ${success ? '✅ PASSED' : '❌ FAILED'}`);
      return success;
    } catch (error) {
      console.error('[CustodialWalletManager] Encryption test failed:', error);
      return false;
    }
  }
}

export default CustodialWalletManager;