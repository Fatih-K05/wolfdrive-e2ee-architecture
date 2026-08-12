export async function generateEncryptionKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable so we can save it
    ['encrypt', 'decrypt']
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('raw', key);
  const exportedKeyBuffer = new Uint8Array(exported);
  return btoa(String.fromCharCode(...exportedKeyBuffer));
}

export async function importKey(base64Key: string): Promise<CryptoKey> {
  const binaryDer = atob(base64Key);
  const keyBuffer = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) {
    keyBuffer[i] = binaryDer.charCodeAt(i);
  }
  return window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    'AES-GCM',
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptFile(file: File | Blob, key: CryptoKey): Promise<{ encryptedBlob: Blob, iv: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const arrayBuffer = await file.arrayBuffer();
  
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    arrayBuffer
  );

  return {
    encryptedBlob: new Blob([encryptedContent], { type: 'application/octet-stream' }),
    iv: btoa(String.fromCharCode(...iv))
  };
}

export async function decryptFile(encryptedBuffer: ArrayBuffer, key: CryptoKey, base64Iv: string): Promise<Blob> {
  const binaryIv = atob(base64Iv);
  const iv = new Uint8Array(binaryIv.length);
  for (let i = 0; i < binaryIv.length; i++) {
    iv[i] = binaryIv.charCodeAt(i);
  }

  const decryptedContent = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedBuffer
  );

  return new Blob([decryptedContent]);
}
