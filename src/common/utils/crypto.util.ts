import * as crypto from 'crypto';

export class CryptoUtil {
  static generateRandomString(length: number): string {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
  }

  static generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  static hashString(text: string, algorithm: string = 'sha256'): string {
    return crypto.createHash(algorithm).update(text).digest('hex');
  }

  static createHmac(text: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(text).digest('hex');
  }

  static encrypt(text: string, key: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  static decrypt(encryptedText: string, key: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}