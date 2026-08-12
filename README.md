# WolfDrive Sıfır Bilgi (Zero-Knowledge) Uçtan Uca Şifreleme Mimarisi

Bu belge, WolfDrive'ın İstemci Tarafı (Client-Side) Sıfır Bilgi Şifreleme protokolünün temel mimarisini ve kod uygulamalarını özetlemektedir.

Tam gizliliği sağlamak için dosyalar, depolama arka planına (ör. Cloudflare R2) iletilmeden önce doğrudan tarayıcı içinde yerel olarak şifrelenir. Sunucu, şifrelenmemiş dosya içeriklerini asla görmez ve aktarım veya bekleme sırasında şifreleme anahtarlarına okunabilir bir formatta sahip olmaz.

## 1. Temel Kriptografik Araçlar (`crypto-utils.ts`)

Şifreleme, 256 bit anahtarlı **AES-GCM** algoritmasını kullanan standart Web Crypto API'sine (`window.crypto.subtle`) dayanır.

```typescript
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
