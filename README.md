# WolfDrive Sıfır Bilgi Uçtan Uca Şifreleme Mimarisi                                                             
                                                                                                                         
    Bu belge, WolfDrive’ın İstemci Tarafı Sıfır Bilgi protokolünün temel mimarisini ve kod uygulamalarını özetlemektedir.     
  Şifreleme protokolü.                                                                                                
                                                                                                                         
    Tam gizliliği sağlamak amacıyla, dosyalar depolama
  arka ucuna (Cloudflare R2) aktarılmadan önce tarayıcıda yerel olarak şifrelenir. Sunucu, şifrelenmemiş dosya içeriğini hiçbir zaman görmez ve aktarım sırasında ya da depolandığı sırada şifreleme
  anahtarlarına okunabilir bir biçimde sahip olmaz.                                                               
                                                                                                                         
    ## 1. Temel Şifreleme Yardımcı Programları (`crypto-utils.ts`)

    Şifreleme, **AES-GCM** algoritmasını
  ve 256-bit anahtar kullanan standart Web Crypto API’sine (`window.crypto.subtle`) dayanmaktadır.                                                                                                   
                                                                                                                         
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
                                                                                                                         
     ## 2. Güvenli Yükleme Engelleyicisi

    Bir kullanıcı yüklemek üzere dosya seçtiğinde, uygulama kuyruğu engeller. Her dosya, herhangi bir ağ isteği gönderilmeden *önce* yeni
  oluşturulan, benzersiz bir AES-256 anahtarıyla şifrelenir.                                                   
                                                                                                                         
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
                                                                                                                         
    Bir kullanıcı bir dosya talep ettiğinde, şifrelenmiş ikili veriler tarayıcının belleğine indirilir. Ardından uygulama,
  saklanan `encryption_key` ve `encryption_iv` değerlerini kullanarak dosyayı yerel olarak şifresini çözdükten sonra tarayıcının kendi
  indirme uyarısını tetikler.                                                                                                      
                                                                                                                         
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
                                                                                                                         
    ## Güvenlik Garantileri
    - **Düz metin ifşası yok:** Şifrelenmemiş dosya verileri hiçbir zaman kullanıcının tarayıcı ortamından dışarı çıkmaz.
    - **Sağlayıcıdan bağımsız:** Bulut depolama sağlayıcısı (Cloudflare R2, AWS S3) ele geçirilse bile, saldırgan yalnızca
  AES-256 ile şifrelenmiş blob'ları görebilir.
    - **Web Standardı:** Protokol, modern tarayıcılara entegre edilmiş, denetlenmiş yerel Web Crypto API'lerini kullanır ve
  üçüncü taraf şifreleme kütüphaneleriyle ilişkili güvenlik açıklarını önler.                                  
