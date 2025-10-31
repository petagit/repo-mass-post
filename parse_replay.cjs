// replay_exact.js
// Best-effort reproduction of the bundle snippet you pasted.
// npm i node-fetch@2 crypto-js buffer

const fetch = require('node-fetch');
const CryptoJS = require('crypto-js');
const { Buffer } = require('buffer');

const API = 'https://dy.kukutool.com/api/parse';

// Values from curl command
const REQUEST_URL = "不打球就下来 http://xhslink.com/o/5sOapFRAkPK Copy and open Xiaohongshu to view the full post！";
const TS = 1761896969;
const SALT = "h9iswapp";
const SIGN = "a925bf647bc00cd9c9deb35d981d2532";
const COOKIES = "NEXT_LOCALE=en; _pk_id.1.2b9a=c9acb6ac3835fb94.1759691777.; _pk_ref.1.2b9a=%5B%22%22%2C%22%22%2C1761894497%2C%22https%3A%2F%2Fwww.google.com%2F%22%5D; _pk_ses.1.2b9a=1";

// likely secret seen earlier in your bundle analysis:
const SECRET = '5Q0NvQxD0zdQ5RLQy5xs';

// --- helpers matching the snippet semantics ---
function md5hex(s) {
  return CryptoJS.MD5(String(s)).toString(CryptoJS.enc.Hex);
}

// attempt a plausible replaceBD: we will try multiple small variants automatically.
// If you find the real replaceBD in the bundle, paste it and replace this function.
function replaceBDVariants(hex) {
  const variants = new Set();
  variants.add(hex); // raw
  // try swapping b <-> d (lowercase)
  variants.add(hex.replace(/b/g,'#').replace(/d/g,'b').replace(/#/g,'d'));
  // uppercase swaps
  variants.add(hex.replace(/B/g,'#').replace(/D/g,'B').replace(/#/g,'D'));
  // try lower->upper mapping on some letters (some obfuscators map case)
  variants.add(hex.toUpperCase());
  variants.add(hex.toLowerCase());
  return Array.from(variants);
}

// reproduce generateSignatureWithMD5 behavior inferred from your snippet:
// 1) take object, sort keys, form "k=v&k2=v2"
// 2) append "&ts=" + ts + "&salt=" + salt + "&secret=" + secret
// 3) md5 -> replaceBD
function generateSignatureWithMD5(requestObj, salt, ts, secret) {
  const keys = Object.keys(requestObj).sort();
  const keyPairs = keys.map(k => `${k}=${requestObj[k]}`).join('&');
  // NOTE: if your bundle uses different literal separators (like different param names),
  // change the three strings below to match it exactly.
  const tsSeparator = '&ts=';
  const saltSeparator = '&salt=';
  const secretSeparator = '&secret=';
  const full = keyPairs + tsSeparator + ts + saltSeparator + salt + secretSeparator + secret;
  const raw = md5hex(full);
  // return candidate list (we'll try all replaceBD guesses)
  return replaceBDVariants(raw);
}

// build ts & salt exactly like the bundle snippet:
function makeTs() { return Math.floor(Date.now()/1000); }
function makeSalt() { return Math.random().toString(36).slice(2,10); }

// --- AES decrypt helper ---
// We observed the response.data is raw bytes, not base64; and iv is 24 bytes, using first 16 bytes
function tryDecrypt(encDataBytes, ivBytes, salt, ts) {
  // encDataBytes: Buffer or Uint8Array
  // ivBytes: Buffer
  // produce ciphertext base64 that CryptoJS can consume:
  const ctBase64 = Buffer.from(encDataBytes).toString('base64');

  // Candidate keys to try (common site patterns)
  // Since we have the exact sign, salt, and ts from curl, try various derivations
  const candidateKeySources = [
    salt,
    salt.substring(0, 16), // truncate to 16 bytes
    md5hex(salt),
    SECRET,
    SECRET.substring(0, 16),
    md5hex(SECRET),
    md5hex(String(ts) + salt + SECRET),
    md5hex(salt + String(ts) + SECRET),
    md5hex(SECRET + salt + String(ts)),
    md5hex(String(ts) + SECRET + salt),
    md5hex(salt + SECRET),
    md5hex(SECRET + salt),
    // Try using the sign itself as key material
    SIGN.substring(0, 16),
    md5hex(SIGN),
    // Try using sign + salt combinations
    md5hex(SIGN + salt),
    md5hex(salt + SIGN),
    md5hex(String(ts) + SIGN),
    md5hex(SIGN + String(ts)),
    // Try combinations
    (salt + SECRET).substring(0, 16),
    (SECRET + salt).substring(0, 16),
    (String(ts) + salt).substring(0, 16),
    (salt + String(ts)).substring(0, 16),
    // Try using the full signature string that would generate the sign
    md5hex('captchaInput=&captchaKey=&requestURL=' + REQUEST_URL + '&ts=' + ts + '&salt=' + salt + '&secret=' + SECRET)
  ];

  // Try different IV parsing methods
  const ivCandidates = [
    CryptoJS.enc.Hex.parse(Buffer.from(ivBytes.slice(0,16)).toString('hex')),
    CryptoJS.enc.Utf8.parse(Buffer.from(ivBytes.slice(0,16)).toString('utf8')),
    CryptoJS.enc.Base64.parse(Buffer.from(ivBytes.slice(0,16)).toString('base64'))
  ];

  for (const keySrc of candidateKeySources) {
    // key: try as hex parse if looks hex, else UTF8 parse
    const keyCandidates = [];
    
    // If it's a 32-char hex string (MD5), parse as hex
    if (/^[0-9a-fA-F]{32}$/.test(keySrc)) {
      keyCandidates.push(CryptoJS.enc.Hex.parse(keySrc));
    }
    
    // Try as UTF8 string (pad/truncate to 16 bytes for AES-128)
    const keyStr = String(keySrc);
    if (keyStr.length >= 16) {
      keyCandidates.push(CryptoJS.enc.Utf8.parse(keyStr.substring(0, 16)));
    } else {
      // Pad with null bytes to 16 bytes
      const padded = keyStr.padEnd(16, '\0');
      keyCandidates.push(CryptoJS.enc.Utf8.parse(padded));
    }
    
    // Try MD5 hash of the key source to get 16 bytes
    const keyHash = md5hex(keySrc);
    keyCandidates.push(CryptoJS.enc.Hex.parse(keyHash));

    for (const keyWordArray of keyCandidates) {
      // Ensure key is proper size (16, 24, or 32 bytes)
      if (keyWordArray.sigBytes !== 16 && keyWordArray.sigBytes !== 24 && keyWordArray.sigBytes !== 32) {
        // Try to pad/truncate
        if (keyWordArray.sigBytes < 16) {
          const padded = keyWordArray.clone();
          padded.sigBytes = 16;
          keyWordArray = padded;
        } else if (keyWordArray.sigBytes > 32) {
          keyWordArray.sigBytes = 32;
        }
      }
      
      for (const ivWordArray of ivCandidates) {
        // Ensure IV is exactly 16 bytes
        if (ivWordArray.sigBytes !== 16) {
          if (ivWordArray.sigBytes < 16) {
            const padded = ivWordArray.clone();
            padded.sigBytes = 16;
            ivWordArray = padded;
          } else {
            ivWordArray.sigBytes = 16;
          }
        }
        
        try {
          const decrypted = CryptoJS.AES.decrypt(ctBase64, keyWordArray, { 
            iv: ivWordArray, 
            mode: CryptoJS.mode.CBC, 
            padding: CryptoJS.pad.Pkcs7 
          });
          const plain = decrypted.toString(CryptoJS.enc.Utf8);
          // Check if decrypted text looks valid (more than just padding)
          if (plain && plain.length > 10 && /[\x20-\x7E\u4E00-\u9FFF]/.test(plain)) {
            return { ok: true, plain, keySrc };
          }
        } catch (e) {
          // ignore and continue
        }
      }
    }
  }
  return { ok: false };
}

// --- main attempt driver ---
(async () => {
  console.log('=== Testing with exact curl parameters ===');
  console.log('requestURL:', REQUEST_URL);
  console.log('ts:', TS);
  console.log('salt:', SALT);
  console.log('sign:', SIGN);
  console.log('');

  // request object you pass in (other fields could be present; snippet used spread on original request)
  const requestObj = { requestURL: REQUEST_URL, captchaKey: "", captchaInput: "" };

  // First, try with the exact sign from curl
  const signsToTry = [SIGN];
  
  // Try to match the known sign with exact curl parameters
  console.log('\n=== Trying to match known sign with exact parameters ===');
  
  // Debug: Show what string is being hashed
  const keys = Object.keys(requestObj).sort();
  const keyPairs = keys.map(k => `${k}=${requestObj[k]}`).join('&');
  const fullString = keyPairs + '&ts=' + TS + '&salt=' + SALT + '&secret=' + SECRET;
  console.log('String being hashed:', fullString);
  console.log('MD5 of that string:', md5hex(fullString));
  console.log('Expected sign:', SIGN);
  
  const testSignsWithExactParams = generateSignatureWithMD5(requestObj, SALT, TS, SECRET);
  console.log('Signs generated with exact params:', testSignsWithExactParams);
  console.log('Known sign in generated list?', testSignsWithExactParams.includes(SIGN));
  
  // Also try generating candidate signs to see if we can match the known sign
  const ts2 = makeTs();
  const salt2 = makeSalt();
  console.log('\nAlso testing with generated ts=', ts2, 'salt=', salt2);
  const candidateSigns = generateSignatureWithMD5(requestObj, salt2, ts2, SECRET);
  console.log('Generated candidateSigns count:', candidateSigns.length);
  console.log('Known sign matches any candidate?', candidateSigns.includes(SIGN));
  
  // Add generated signs to try list
  signsToTry.push(...candidateSigns);

  for (const sign of signsToTry) {
    console.log('Trying sign:', sign.slice(0,12), '...');
    // Use exact curl params if this is the known sign, otherwise use generated values
    const useExactParams = (sign === SIGN);
    const tsToUse = useExactParams ? TS : ts2;
    const saltToUse = useExactParams ? SALT : salt2;
    
    const body = {
      ...requestObj,
      ts: tsToUse,
      salt: saltToUse,
      sign
    };

    const headers = {
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'Origin': 'https://dy.kukutool.com',
      'Referer': 'https://dy.kukutool.com/xiaohongshu',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'
    };
    
    // Add cookies if using exact params
    if (useExactParams && COOKIES) {
      headers['Cookie'] = COOKIES;
    }

    const res = await fetch(API, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const buff = await res.buffer();
    let text;
    try { text = buff.toString('utf8'); } catch(e){ text = null; }

    // The server returns JSON; try parse first
    let json;
    try { json = JSON.parse(text); } catch (e) { json = null; }

    if (json && json.encrypt && json.data) {
      console.log('Received encrypted response (json). Preparing to decrypt...');
      // data appears to be raw binary bytes encoded as string; in many responses it's returned as binary buffer
      // sometimes server returns binary in body rather than json object — we handled earlier. Here it's JSON with data string.
      // If json.data is a base64 string, convert; otherwise treat as raw bytes per your notes.
      let encData = json.data;
      let iv = json.iv || '';
      
      console.log('Encrypted data type:', typeof encData, 'length:', encData?.length);
      console.log('Has control chars:', typeof encData === 'string' && /[\x00-\x08\x0B-\x1F\x7F-\x9F]/.test(encData));
      
      // If encData is an array-like or object, handle accordingly
      let encBuf;
      if (typeof encData === 'string') {
        // Check if it contains control characters (raw binary)
        if (/[\x00-\x08\x0B-\x1F\x7F-\x9F]/.test(encData)) {
          // Raw binary bytes - convert from latin1/binary encoding
          encBuf = Buffer.from(encData, 'latin1');
          console.log('Detected raw binary data, converted to buffer, length:', encBuf.length);
        } else if (/^[A-Za-z0-9+/=]+$/.test(encData) && encData.length % 4 === 0) {
          // Base64 encoded
          encBuf = Buffer.from(encData, 'base64');
          console.log('Detected base64 data, converted to buffer, length:', encBuf.length);
        } else {
          // Try parsing as JSON array
          try {
            const arr = JSON.parse(encData);
            if (Array.isArray(arr)) {
              encBuf = Buffer.from(arr);
              console.log('Parsed as JSON array, length:', encBuf.length);
            } else {
              encBuf = Buffer.from(encData, 'binary');
            }
          } catch(e) {
            encBuf = Buffer.from(encData, 'binary');
            console.log('Using binary encoding fallback');
          }
        }
      } else if (Array.isArray(encData)) {
        encBuf = Buffer.from(encData);
      } else {
        console.warn('Unexpected data type for json.data:', typeof encData);
        continue;
      }

      // iv handling: if iv is string of raw bytes or base64
      let ivBuf;
      if (typeof iv === 'string') {
        // Check for control characters (raw binary)
        if (/[\x00-\x08\x0B-\x1F\x7F-\x9F]/.test(iv)) {
          ivBuf = Buffer.from(iv, 'latin1');
          console.log('IV detected as raw binary, length:', ivBuf.length);
        } else if (/^[A-Za-z0-9+/=]+$/.test(iv) && iv.length % 4 === 0) {
          ivBuf = Buffer.from(iv, 'base64');
          console.log('IV detected as base64, length:', ivBuf.length);
        } else {
          // try parse as JSON array
          try {
            const arr = JSON.parse(iv);
            if (Array.isArray(arr)) ivBuf = Buffer.from(arr);
            else ivBuf = Buffer.from(iv, 'binary');
          } catch(e) {
            ivBuf = Buffer.from(iv, 'binary');
          }
        }
      } else if (Array.isArray(iv)) ivBuf = Buffer.from(iv);
      else ivBuf = Buffer.alloc(16); // fallback

      // ensure we use first 16 bytes
      if (!ivBuf || ivBuf.length < 16) {
        console.warn('iv length < 16, using fallback zeros');
        ivBuf = Buffer.alloc(16);
      } else if (ivBuf.length > 16) {
        ivBuf = ivBuf.slice(0,16);
      }

      // Try decryption - use the salt/ts that were used in the request
      const dec = tryDecrypt(encBuf, ivBuf, saltToUse, tsToUse);
      if (dec.ok) {
        console.log('Decryption succeeded! keySrcUsed=', dec.keySrc);
        console.log('Plaintext (first 2000 chars):\n', dec.plain.slice(0,2000));
        // if JSON
        try { const parsed = JSON.parse(dec.plain); console.log('Parsed JSON:', parsed);
          const str = JSON.stringify(parsed);
          const mp4 = str.match(/https?:\/\/[^"']+\.mp4/);
          if (mp4) console.log('Found mp4 URL:', mp4[0]);
        } catch(e){}
        return;
      } else {
        console.log('Tried sign variant but could not decrypt with candidate key derivations.');
      }
    } else {
      // not encrypted JSON; print a short snippet
      console.log('Server response (status', res.status + '):', (text || buff.toString('hex')).slice(0,300));
    }
  }

  console.log('All sign candidates tried without success. Next step: paste the `replaceBD` function body or the exact generateSignatureWithMD5 snippet that includes the constants used when building the final string; that will allow a byte-perfect reproduction.');
})();