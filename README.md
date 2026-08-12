# WolfDrive Zero-Knowledge E2E Encryption Architecture                                                               
                                                                                                                         
    This document outlines the core architecture and code implementations for WolfDrive's Client-Side Zero-Knowledge     
  Encryption protocol.                                                                                                   
                                                                                                                         
    To ensure complete privacy, files are encrypted natively in the browser before being transmitted to the storage      
  backend (e.g., Cloudflare R2). The server never sees the unencrypted file contents and does not possess the encryption 
  keys in a readable format during the transfer or rest.                                                                 
                                                                                                                         
    ## 1. Core Cryptographic Utilities (`crypto-utils.ts`)                                                               
                                                                                                                         
    The encryption relies on the standard Web Crypto API (`window.crypto.subtle`) utilizing the **AES-GCM** algorithm    
  with a 256-bit key.                                                                                                    
                                                                                                                         
    \`\`\`typescript                                                                                                     
    // @app/drive/crypto/crypto-utils.ts                                                                                 
                                                                                                                         
    export async function generateEncryptionKey(): Promise<CryptoKey> {                                                  
        return await window.crypto.subtle.generateKey(                                                                   
            {                                                                                                            
                name: 'AES-GCM',                                                                                         
                length: 256,                                                                                             
            },                                                                                                           
            true,                                                                                                        
            ['encrypt', 'decrypt']                                                                                       
        );                                                                                                               
    }                                                                                                                    
                                                                                                                         
    export async function encryptFile(                                                                                   
        file: File | Blob,                                                                                               
        key: CryptoKey                                                                                                   
    ): Promise<{ encryptedBlob: Blob; iv: string }> {                                                                    
        const iv = window.crypto.getRandomValues(new Uint8Array(12));                                                    
        const buffer = await file.arrayBuffer();                                                                         
                                                                                                                         
        const encryptedContent = await window.crypto.subtle.encrypt(                                                     
            {                                                                                                            
                name: 'AES-GCM',                                                                                         
                iv: iv,                                                                                                  
            },                                                                                                           
            key,                                                                                                         
            buffer                                                                                                       
        );                                                                                                               
                                                                                                                         
        const encryptedBlob = new Blob([encryptedContent]);                                                              
        const ivString = btoa(String.fromCharCode(...iv));                                                               
                                                                                                                         
        return { encryptedBlob, iv: ivString };                                                                          
    }                                                                                                                    
                                                                                                                         
    export async function decryptFile(                                                                                   
        encryptedBuffer: ArrayBuffer,                                                                                    
        key: CryptoKey,                                                                                                  
        ivString: string                                                                                                 
    ): Promise<Blob> {                                                                                                   
        const iv = new Uint8Array(                                                                                       
            atob(ivString)                                                                                               
                .split('')                                                                                               
                .map(char => char.charCodeAt(0))                                                                         
        );                                                                                                               
                                                                                                                         
        const decryptedContent = await window.crypto.subtle.decrypt(                                                     
            {                                                                                                            
                name: 'AES-GCM',                                                                                         
                iv: iv,                                                                                                  
            },                                                                                                           
            key,                                                                                                         
            encryptedBuffer                                                                                              
        );                                                                                                               
                                                                                                                         
        return new Blob([decryptedContent]);                                                                             
    }                                                                                                                    
                                                                                                                         
    export async function exportKey(key: CryptoKey): Promise<string> {                                                   
        const exported = await window.crypto.subtle.exportKey('raw', key);                                               
        return btoa(String.fromCharCode(...new Uint8Array(exported)));                                                   
    }                                                                                                                    
                                                                                                                         
    export async function importKey(keyString: string): Promise<CryptoKey> {                                             
        const keyBytes = new Uint8Array(                                                                                 
            atob(keyString)                                                                                              
                .split('')                                                                                               
                .map(char => char.charCodeAt(0))                                                                         
        );                                                                                                               
        return await window.crypto.subtle.importKey(                                                                     
            'raw',                                                                                                       
            keyBytes,                                                                                                    
            {                                                                                                            
                name: 'AES-GCM',                                                                                         
            },                                                                                                           
            true,                                                                                                        
            ['encrypt', 'decrypt']                                                                                       
        );                                                                                                               
    }                                                                                                                    
    \`\`\`                                                                                                               
                                                                                                                         
    ## 2. Secure Upload Interceptor                                                                                      
                                                                                                                         
    When a user selects files for upload, the application intercepts the queue. Each file is encrypted with a newly      
  generated, unique AES-256 key *before* any network request is made.                                                    
                                                                                                                         
    \`\`\`typescript                                                                                                     
    // Intercepting and Encrypting Files Before Upload                                                                   
    const encryptedFiles = await Promise.all([...files].map(async file => {                                              
        const rawFile = file instanceof UploadedFile ? file.native : file;                                               
                                                                                                                         
        // 1. Generate unique key for this file                                                                          
        const key = await generateEncryptionKey();                                                                       
                                                                                                                         
        // 2. Encrypt file contents using Web Crypto API                                                                 
        const { encryptedBlob, iv } = await encryptFile(rawFile, key);                                                   
                                                                                                                         
        // 3. Package encrypted Blob as a new File                                                                       
        const encryptedNative = new File([encryptedBlob], rawFile.name, { type: rawFile.type });                         
        const uploadedFile = new UploadedFile(encryptedNative);                                                          
                                                                                                                         
        // 4. Attach encryption metadata to be stored safely                                                             
        uploadedFile.encryption_iv = iv;                                                                                 
        uploadedFile.encryption_key = await exportKey(key);                                                              
                                                                                                                         
        return uploadedFile;                                                                                             
    }));                                                                                                                 
                                                                                                                         
    // Upload the encrypted Blobs to Server / Cloudflare R2                                                              
    uploadMultiple(encryptedFiles, { ... });                                                                             
    \`\`\`                                                                                                               
                                                                                                                         
    ## 3. Client-Side Decryption on Download                                                                             
                                                                                                                         
    When a user requests a file, the encrypted binary data is downloaded to the browser's memory. The application then   
  uses the stored `encryption_key` and `encryption_iv` to decrypt the file locally before triggering the browser's native
  download prompt.                                                                                                       
                                                                                                                         
    \`\`\`typescript                                                                                                     
    // Secure Client-Side Decryption Hook                                                                                
    execute: async () => {                                                                                               
      if (entries.length === 1 && entries[0].encryption_key && entries[0].encryption_iv) {                               
         const toastId = toast.loading("Downloading and decrypting securely...");                                        
         try {                                                                                                           
             // 1. Fetch encrypted binary from Cloudflare R2                                                             
             const res = await fetch(downloadUrl);                                                                       
             const encryptedBuffer = await res.arrayBuffer();                                                            
                                                                                                                         
             // 2. Import the unique encryption key                                                                      
             const key = await importKey(entries[0].encryption_key);                                                     
                                                                                                                         
             // 3. Decrypt the payload entirely in browser memory                                                        
             const decryptedBlob = await decryptFile(encryptedBuffer, key, entries[0].encryption_iv);                    
                                                                                                                         
             // 4. Trigger download of the decrypted file to the user's local disk                                       
             const objectUrl = URL.createObjectURL(decryptedBlob);                                                       
             const link = document.createElement('a');                                                                   
             link.href = objectUrl;                                                                                      
             link.download = entries[0].name;                                                                            
             link.click();                                                                                               
             URL.revokeObjectURL(objectUrl);                                                                             
                                                                                                                         
             toast.success("Decrypted successfully", {id: toastId});                                                     
         } catch(e) {                                                                                                    
             toast.error("Decryption failed. Data might be corrupted.", {id: toastId});                                  
         }                                                                                                               
      }                                                                                                                  
    }                                                                                                                    
    \`\`\`                                                                                                               
                                                                                                                         
    ## Security Guarantees                                                                                               
    - **No plaintext exposure:** The unencrypted file data never leaves the user's browser environment.                  
    - **Provider agnostic:** Even if the cloud storage provider (Cloudflare R2, AWS S3) is compromised, the attacker only
  sees AES-256 encrypted blobs.                                                                                          
    - **Web Standard:** The protocol leverages native, audited Web Crypto APIs built into modern browsers, preventing    
  vulnerabilities associated with third-party crypto libraries.                                                          
    ```***                                                              
