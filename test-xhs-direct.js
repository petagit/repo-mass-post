// Test script to extract video URLs from XHS shortened link
const https = require('https');
const http = require('http');

const SHORT_URL = 'http://xhslink.com/o/7YhgVFfH3N5';

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.xiaohongshu.com/',
      },
      maxRedirects: 10,
    }, (res) => {
      let data = '';
      let finalUrl = res.headers.location || url;
      
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve({ status: res.statusCode, url: res.headers.location, html: null });
      }
      
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, url: res.headers.location || url, html: data });
      });
    });
    
    req.on('error', reject);
    req.setMaxListeners(0);
  });
}

function extractVideoUrls(html) {
  const videoUrls = new Set();
  
  // Look for xhscdn.com video URLs
  const xhsVideoPattern = /https?:\/\/[^"'\s<>]+xhscdn[^"'\s<>]+\.mp4[^"'\s<>]*/gi;
  const matches = html.matchAll(xhsVideoPattern);
  for (const match of matches) {
    const cleanUrl = match[0].replace(/\\\//g, '/').replace(/&amp;/g, '&');
    videoUrls.add(cleanUrl);
  }
  
  // Look in script tags for JSON data
  const scriptMatches = html.matchAll(/<script[^>]*>(.*?)<\/script>/gis);
  for (const match of scriptMatches) {
    const scriptContent = match[1];
    // Look for JSON objects with video URLs
    const jsonMatches = scriptContent.matchAll(/"url"\s*:\s*"([^"]+)"/gi);
    for (const jsonMatch of jsonMatches) {
      const url = jsonMatch[1].replace(/\\\//g, '/');
      if (/xhscdn.*\.mp4/i.test(url)) {
        videoUrls.add(url);
      }
    }
  }
  
  return Array.from(videoUrls);
}

async function testVideoUrl(videoUrl) {
  return new Promise((resolve, reject) => {
    const client = videoUrl.startsWith('https') ? https : http;
    const headers = {
      'sec-ch-ua-platform': '"macOS"',
      'Referer': 'https://www.xiaohongshu.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
      'Range': 'bytes=10070-1120327',
      'sec-ch-ua-mobile': '?0',
    };
    
    const req = client.get(videoUrl, { headers }, (res) => {
      const responseHeaders = {};
      Object.keys(res.headers).forEach(key => {
        responseHeaders[key] = res.headers[key];
      });
      
      resolve({
        status: res.statusCode,
        contentType: res.headers['content-type'] || '',
        accessible: res.statusCode === 200 || res.statusCode === 206,
        headers: responseHeaders,
      });
    });
    
    req.on('error', (err) => {
      resolve({
        status: 0,
        accessible: false,
        error: err.message,
      });
    });
  });
}

async function main() {
  console.log('=== Testing XHS Direct Extraction ===\n');
  console.log(`1. Resolving shortened URL: ${SHORT_URL}`);
  
  // Step 1: Resolve shortened URL
  let resolvedUrl = SHORT_URL;
  let html = '';
  
  try {
    const result = await fetchUrl(SHORT_URL);
    if (result.status >= 300 && result.status < 400 && result.url) {
      resolvedUrl = result.url;
      console.log(`   → Redirected to: ${resolvedUrl}`);
      // Fetch the actual page
      const pageResult = await fetchUrl(resolvedUrl);
      if (pageResult.html) {
        html = pageResult.html;
      }
    } else if (result.html) {
      html = result.html;
    }
    
    if (!html) {
      console.log('   ⚠️  No HTML content received, trying direct fetch...');
      const directResult = await fetchUrl(resolvedUrl);
      html = directResult.html || '';
    }
    
    console.log(`   ✓ HTML length: ${html.length} bytes\n`);
  } catch (err) {
    console.error(`   ✗ Error: ${err.message}\n`);
    return;
  }
  
  if (!html) {
    console.log('✗ Failed to fetch HTML content');
    return;
  }
  
  // Step 2: Extract video URLs
  console.log('2. Extracting video URLs from HTML...');
  const videoUrls = extractVideoUrls(html);
  console.log(`   Found ${videoUrls.length} video URL(s)`);
  
  if (videoUrls.length === 0) {
    console.log('   ⚠️  No video URLs found. Showing first 500 chars of HTML for debugging:');
    console.log('   ' + html.substring(0, 500).replace(/\n/g, ' '));
    return;
  }
  
  videoUrls.forEach((url, idx) => {
    console.log(`   ${idx + 1}. ${url}`);
  });
  console.log('');
  
  // Step 3: Test first video URL
  if (videoUrls.length > 0) {
    const testUrl = videoUrls[0];
    console.log(`3. Testing video URL with curl-like headers:`);
    console.log(`   ${testUrl}\n`);
    
    const testResult = await testVideoUrl(testUrl);
    
    console.log('   Test Results:');
    console.log(`   - Status: ${testResult.status}`);
    console.log(`   - Content-Type: ${testResult.contentType || 'N/A'}`);
    console.log(`   - Accessible: ${testResult.accessible ? '✓ YES' : '✗ NO'}`);
    
    if (testResult.headers) {
      console.log('\n   Response Headers:');
      Object.entries(testResult.headers).forEach(([key, value]) => {
        console.log(`   - ${key}: ${value}`);
      });
    }
    
    if (testResult.error) {
      console.log(`   - Error: ${testResult.error}`);
    }
  }
}

main().catch(console.error);

