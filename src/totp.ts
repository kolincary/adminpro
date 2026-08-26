// src/lib/totp.ts

export async function generateTOTPCode(secret: string = "ADMIN_REPORT_PRO_SECRET_KEY"): Promise<string> {
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 60); // 60 seconds interval
  
  const encoder = new TextEncoder();
  const data = encoder.encode(secret + timeStep.toString());
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Dynamic truncation (HOTP standard approach adapted for SHA-256)
  const offset = hashArray[hashArray.length - 1] & 0xf;
  const binary = 
    ((hashArray[offset] & 0x7f) << 24) |
    ((hashArray[offset + 1] & 0xff) << 16) |
    ((hashArray[offset + 2] & 0xff) << 8) |
    (hashArray[offset + 3] & 0xff);
    
  // Get a 6 digit code
  const code = (binary % 1000000).toString().padStart(6, '0');
  return code;
}

export function getTOTPRemainingSeconds(): number {
  const epoch = Math.floor(Date.now() / 1000);
  return 60 - (epoch % 60);
}
