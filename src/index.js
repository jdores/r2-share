// src/index.js

/**
 * Cloudflare Worker for R2 File Management
 * Features:
 * - Upload files to R2 bucket (with chunked upload support for large files)
 * - List files in R2 bucket
 * - Download files from R2 bucket
 */

// HTML template for the main page
const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>R2 Share</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      color: #2196F3;
    }
    .upload-container {
      border: 2px dashed #ccc;
      padding: 20px;
      margin: 20px 0;
      border-radius: 5px;
      text-align: center;
    }
    .file-list {
      margin-top: 20px;
    }
    .file-item {
      padding: 10px;
      border-bottom: 1px solid #eee;
    }
    .file-item:hover {
      background-color: #f5f5f5;
    }
    .file-item a {
      color: #2196F3;
      text-decoration: none;
    }
    .file-item a:hover {
      text-decoration: underline;
    }
    .progress {
      width: 100%;
      height: 20px;
      margin-top: 10px;
      display: none;
    }
    #status {
      margin-top: 10px;
      color: #666;
    }
    .button {
      background-color: #2196F3;
      color: white;
      padding: 10px 15px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .button:hover {
      background-color: #0b7dda;
    }
  </style>
</head>
<body>
  <h1>R2 Share</h1>
  
  <div class="upload-container">
    <h2>Upload Files</h2>
    <p>Select a file to upload to the R2 bucket.</p>
    <input type="file" id="fileInput">
    <button id="uploadButton" class="button">Upload File</button>
    <progress id="uploadProgress" class="progress" max="100" value="0"></progress>
    <div id="status"></div>
  </div>
  
  <div class="file-list">
    <h2>Files in Bucket</h2>
    <a href="/list" class="button">Refresh File List</a>
    <div id="fileList">Loading files...</div>
  </div>

  <script>
    // Constants
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    
    // Elements
    const fileInput = document.getElementById('fileInput');
    const uploadButton = document.getElementById('uploadButton');
    const progressBar = document.getElementById('uploadProgress');
    const statusElement = document.getElementById('status');
    const fileListElement = document.getElementById('fileList');
    
    // Load file list on page load
    window.addEventListener('load', fetchFileList);
    
    // Set up upload button
    uploadButton.addEventListener('click', handleUpload);
    
    function fetchFileList() {
      fetch('/list')
        .then(response => response.json())
        .then(data => {
          if (data.files && data.files.length > 0) {
            const fileItems = data.files.map(file => {
              return \`<div class="file-item">
                <a href="/download/\${encodeURIComponent(file.name)}">\${file.name}</a>
                <span style="color: #666; margin-left: 10px;">\${formatSize(file.size)}</span>
              </div>\`;
            }).join('');
            fileListElement.innerHTML = fileItems;
          } else {
            fileListElement.innerHTML = '<p>No files found in the bucket.</p>';
          }
        })
        .catch(error => {
          console.error('Error fetching file list:', error);
          fileListElement.innerHTML = '<p>Error loading file list. Please try again.</p>';
        });
    }
    
    function formatSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    async function handleUpload() {
      const file = fileInput.files[0];
      if (!file) {
        statusElement.textContent = 'Please select a file first.';
        return;
      }
      
      try {
        statusElement.textContent = 'Preparing upload...';
        progressBar.style.display = 'block';
        progressBar.value = 0;
        
        // Prepare the upload
        const response = await fetch('/prepare-upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            size: file.size
          }),
        });
        
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.message || 'Failed to prepare upload');
        }
        
        const uploadId = result.uploadId;
        const chunks = Math.ceil(file.size / CHUNK_SIZE);
        
        // Upload each chunk sequentially
        for (let i = 0; i < chunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(file.size, start + CHUNK_SIZE);
          const chunk = file.slice(start, end);
          
          await uploadChunk(chunk, i, uploadId, file.name);
          progressBar.value = ((i + 1) / chunks) * 100;
          statusElement.textContent = \`Uploading chunk \${i + 1} of \${chunks}...\`;
        }
        
        // Complete the upload
        const completeResponse = await fetch('/complete-upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: file.name,
            uploadId: uploadId,
            chunks: chunks
          }),
        });
        
        const completeResult = await completeResponse.json();
        if (!completeResult.success) {
          throw new Error(completeResult.message || 'Failed to complete upload');
        }
        
        progressBar.value = 100;
        statusElement.textContent = 'Upload completed successfully!';
        
        // Refresh file list
        fetchFileList();
        
      } catch (error) {
        console.error('Upload error:', error);
        statusElement.textContent = \`Upload failed: \${error.message}\`;
      }
    }
    
    async function uploadChunk(chunk, index, uploadId, filename) {
      const formData = new FormData();
      formData.append('chunk', chunk);
      formData.append('index', index.toString());
      formData.append('uploadId', uploadId);
      formData.append('filename', filename);
      
      const response = await fetch('/upload-chunk', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(\`Upload failed for chunk \${index}: \${result.message}\`);
      }
      
      return result;
    }
  </script>
</body>
</html>
`;

// Worker event handler
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      
      // Serve HTML page
      if (path === '/' || path === '') {
        return new Response(htmlTemplate, {
          headers: { 'Content-Type': 'text/html' },
        });
      }
      
      // List files in bucket
      if (path === '/list') {
        return await listFiles(env);
      }
      
      // Download file
      if (path.startsWith('/download/')) {
        const filename = decodeURIComponent(path.substring('/download/'.length));
        return await downloadFile(filename, env);
      }
      
      // Prepare multipart upload
      if (path === '/prepare-upload') {
        return await prepareUpload(request, env);
      }
      
      // Upload chunk
      if (path === '/upload-chunk') {
        return await uploadChunk(request, env);
      }
      
      // Complete multipart upload
      if (path === '/complete-upload') {
        return await completeUpload(request, env);
      }
      
      // Not found
      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        success: false,
        message: 'Internal Server Error',
        details: error.message,
        stack: error.stack
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

// List files in the bucket
async function listFiles(env) {
  const bucket = env.FILE_BUCKET;
  const options = {
    limit: 1000,
  };
  
  // List objects in the bucket
  const objects = await bucket.list(options);
  
  // Filter out chunk files (files with .chunk prefix)
  const files = objects.objects
    .filter(object => !object.key.includes('.chunk.') && !object.key.endsWith('.meta'))
    .map(object => {
      return {
        name: object.key,
        size: object.size,
        uploaded: object.uploaded
      };
    });
  
  return new Response(JSON.stringify({ success: true, files }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Download a file from the bucket
async function downloadFile(filename, env) {
  const bucket = env.FILE_BUCKET;
  
  // Check if file exists
  const object = await bucket.get(filename);
  if (!object) {
    return new Response(JSON.stringify({
      success: false,
      message: 'File not found'
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Set appropriate headers
  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  
  // Return the file stream directly
  return new Response(object.body, { headers });
}

// Prepare a multipart upload
async function prepareUpload(request, env) {
  const data = await request.json();
  const { filename, contentType, size } = data;
  
  if (!filename) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Filename is required'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Generate unique upload ID
  const uploadId = crypto.randomUUID();
  
  // Store upload metadata
  await env.FILE_BUCKET.put(`${uploadId}.meta`, JSON.stringify({
    filename,
    contentType: contentType || 'application/octet-stream',
    size,
    uploadId,
    createdAt: new Date().toISOString(),
    status: 'in-progress'
  }));
  
  return new Response(JSON.stringify({
    success: true,
    uploadId,
    message: 'Upload prepared successfully'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Handle chunk upload - FIXED VERSION
async function uploadChunk(request, env) {
  try {
    const formData = await request.formData();
    const chunkBlob = formData.get('chunk');
    const index = formData.get('index');
    const uploadId = formData.get('uploadId');
    const filename = formData.get('filename');
    
    if (!chunkBlob || index === undefined || !uploadId || !filename) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Missing required fields: chunk, index, uploadId, and filename are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Store the chunk
    const chunkKey = `${uploadId}.chunk.${index}`;
    
    // Get the binary data from the blob
    const arrayBuffer = await chunkBlob.arrayBuffer();
    
    // Use R2 put with the array buffer directly - this ensures a known length
    await env.FILE_BUCKET.put(chunkKey, arrayBuffer, {
      httpMetadata: {
        contentType: 'application/octet-stream'
      }
    });
    
    return new Response(JSON.stringify({
      success: true,
      message: `Chunk ${index} uploaded successfully`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Chunk upload error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: `Failed to upload chunk: ${error.message}`,
      details: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Complete multipart upload - IMPROVED VERSION
async function completeUpload(request, env) {
  const data = await request.json();
  const { filename, uploadId, chunks } = data;
  
  if (!filename || !uploadId || chunks === undefined) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Missing required fields: filename, uploadId, and chunks are required'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Get upload metadata
    const metaObject = await env.FILE_BUCKET.get(`${uploadId}.meta`);
    if (!metaObject) {
      throw new Error('Upload metadata not found');
    }
    
    const metadata = JSON.parse(await metaObject.text());
    
    // For smaller files, we can combine chunks in memory
    if (metadata.size < 100 * 1024 * 1024) { // Under 100MB
      // Arrays to store all chunk data
      const allChunks = [];
      
      // Read all chunks
      for (let i = 0; i < chunks; i++) {
        const chunkKey = `${uploadId}.chunk.${i}`;
        const chunkObject = await env.FILE_BUCKET.get(chunkKey);
        
        if (!chunkObject) {
          throw new Error(`Chunk ${i} not found`);
        }
        
        const chunkData = await chunkObject.arrayBuffer();
        allChunks.push(new Uint8Array(chunkData));
      }
      
      // Combine chunks
      const totalLength = allChunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combinedArray = new Uint8Array(totalLength);
      
      let offset = 0;
      for (const chunk of allChunks) {
        combinedArray.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Upload combined file
      await env.FILE_BUCKET.put(filename, combinedArray.buffer, {
        httpMetadata: {
          contentType: metadata.contentType || 'application/octet-stream'
        }
      });
    } else {
      // For larger files, use R2's multipart upload API
      const uploadOptions = {
        customMetadata: { source: 'r2-file-manager' },
        httpMetadata: {
          contentType: metadata.contentType || 'application/octet-stream'
        }
      };
      
      // Initialize multipart upload
      const multipartUpload = await env.FILE_BUCKET.createMultipartUpload(filename, uploadOptions);
      
      // Upload parts
      const uploadPartPromises = [];
      for (let i = 0; i < chunks; i++) {
        const chunkKey = `${uploadId}.chunk.${i}`;
        const chunkObject = await env.FILE_BUCKET.get(chunkKey);
        
        if (!chunkObject) {
          throw new Error(`Chunk ${i} not found`);
        }
        
        const chunkData = await chunkObject.arrayBuffer();
        const partNumber = i + 1; // Multipart upload part numbers start at 1
        
        uploadPartPromises.push(
          multipartUpload.uploadPart(partNumber, chunkData)
        );
      }
      
      // Wait for all parts to upload
      const uploadedParts = await Promise.all(uploadPartPromises);
      
      // Complete the multipart upload
      await multipartUpload.complete(uploadedParts);
    }
    
    // Clean up chunk files and metadata
    await cleanupChunks(env, uploadId, chunks);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Upload completed successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Complete upload error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: `Failed to complete upload: ${error.message}`,
      details: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Helper function to clean up chunks and metadata
async function cleanupChunks(env, uploadId, chunks) {
  // Delete all chunk files
  const deletePromises = [];
  
  // Delete chunks
  for (let i = 0; i < chunks; i++) {
    const chunkKey = `${uploadId}.chunk.${i}`;
    deletePromises.push(env.FILE_BUCKET.delete(chunkKey));
  }
  
  // Delete metadata
  deletePromises.push(env.FILE_BUCKET.delete(`${uploadId}.meta`));
  
  // Wait for all delete operations to complete
  await Promise.all(deletePromises);
}