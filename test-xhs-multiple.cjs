// Test script to extract video URLs from multiple XHS shortened links
const https = require('https');
const http = require('http');

const SHORT_URLS = [
  { name: '2 Ellie - 中村茜', url: 'http://xhslink.com/o/9FaG5P9yAoP' },
  { name: '3 Alice - absent', url: 'http://xhslink.com/o/AuqIR6L2wRu' },
  { name: '4 Iuno - 弦小歌', url: 'http://xhslink.com/o/8oYNSCW4CeO' },
  { name: '5 (tested) - 弦小歌', url: 'http://xhslink.com/o/7YhgVFfH3N5' },
  { name: '6 Firefly - 半糖织雪', url: 'http://xhslink.com/o/26xHbCjMhoU' },
  { name: '7 糊糊盟主', url: 'http://xhslink.com/o/7o7LFm2mVrH' },
  { name: '8 Doris - 姬Kawa', url: 'http://xhslink.com/o/9CsoCa4OYCy' },
  { name: '9 Nilou - 梨子味儿的雪', url: 'http://xhslink.com/o/W7QNtJA3z6' },
];

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
  return new Promise((resolve) => {
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
    
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({
        status: 0,
        accessible: false,
        error: 'Request timeout',
      });
    });
  });
}

async function testLink(linkInfo) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${linkInfo.name}`);
  console.log(`URL: ${linkInfo.url}`);
  console.log('-'.repeat(80));
  
  try {
    // Step 1: Resolve shortened URL
    const result = await fetchUrl(linkInfo.url);
    let resolvedUrl = linkInfo.url;
    let html = '';
    
    if (result.status >= 300 && result.status < 400 && result.url) {
      resolvedUrl = result.url;
      console.log(`✓ Resolved to: ${resolvedUrl.substring(0, 100)}...`);
      // Fetch the actual page
      const pageResult = await fetchUrl(resolvedUrl);
      if (pageResult.html) {
        html = pageResult.html;
      }
    } else if (result.html) {
      html = result.html;
    }
    
    if (!html && resolvedUrl !== linkInfo.url) {
      const directResult = await fetchUrl(resolvedUrl);
      html = directResult.html || '';
    }
    
    if (!html) {
      console.log('✗ Failed to fetch HTML content');
      return { success: false, error: 'No HTML content' };
    }
    
    console.log(`✓ HTML fetched: ${html.length} bytes`);
    
    // Step 2: Extract video URLs
    const videoUrls = extractVideoUrls(html);
    console.log(`✓ Found ${videoUrls.length} video URL(s)`);
    
    if (videoUrls.length === 0) {
      console.log('⚠️  No video URLs found');
      return { success: false, error: 'No video URLs found', resolvedUrl };
    }
    
    videoUrls.forEach((url, idx) => {
      console.log(`  ${idx + 1}. ${url}`);
    });
    
    // Step 3: Test first video URL
    const testUrl = videoUrls[0];
    console.log(`\nTesting video URL with curl-like headers...`);
    
    const testResult = await testVideoUrl(testUrl);
    
    if (testResult.accessible) {
      console.log(`✓ SUCCESS - Status: ${testResult.status}, Content-Type: ${testResult.contentType}`);
      return {
        success: true,
        resolvedUrl,
        videoUrl: testUrl,
        status: testResult.status,
        contentType: testResult.contentType,
      };
    } else {
      console.log(`✗ FAILED - Status: ${testResult.status}, Error: ${testResult.error || 'N/A'}`);
      return {
        success: false,
        resolvedUrl,
        videoUrl: testUrl,
        status: testResult.status,
        error: testResult.error,
      };
    }
  } catch (err) {
    console.log(`✗ ERROR: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('=== Testing Multiple XHS Links ===\n');
  
  const results = [];
  
  for (const linkInfo of SHORT_URLS) {
    const result = await testLink(linkInfo);
    results.push({ ...linkInfo, ...result });
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log('='.repeat(80));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✓ Successful: ${successful.length}/${results.length}`);
  successful.forEach(r => {
    console.log(`  - ${r.name}: ${r.videoUrl ? r.videoUrl.substring(0, 60) + '...' : 'N/A'}`);
  });
  
  console.log(`\n✗ Failed: ${failed.length}/${results.length}`);
  failed.forEach(r => {
    console.log(`  - ${r.name}: ${r.error || 'Unknown error'}`);
  });
}

main().catch(console.error);



