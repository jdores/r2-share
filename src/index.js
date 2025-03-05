/**
 * Cloudflare worker to securely upload and download files from R2.
 */

export default {
	async fetch(request, env) {
	  const url = new URL(request.url);
  
	  if (request.method === "GET" && url.pathname === "/") {
		// Serve the HTML page
		return new Response(generateHTML(), {
		  headers: { "Content-Type": "text/html" },
		});
	  }
  
	  if (request.method === "POST" && url.pathname === "/upload") {
		return await handleUpload(request, env);
	  }
  
	  if (request.method === "GET" && url.pathname === "/list") {
		return await listFiles(env);
	  }
  
	  if (request.method === "GET" && url.pathname.startsWith("/download/")) {
		const filename = url.pathname.replace("/download/", "");
		return await downloadFile(env, filename);
	  }
  
	  return new Response("Not Found", { status: 404 });
	},
  };
  
  // Generate HTML page with modern CSS styling
  function generateHTML() {
	return `
	  <!DOCTYPE html>
	  <html lang="en">
  
	  <head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>R2 File Upload</title>
		<style>
		  /* Base Styles */
		  body {
			font-family: 'Inter', sans-serif;
			background: #f9f9f9;
			color: #333;
			margin: 0;
			padding: 0;
			display: flex;
			justify-content: center;
			align-items: center;
			min-height: 100vh;
			box-sizing: border-box;
		  }
  
		  .container {
			max-width: 600px;
			width: 100%;
			padding: 2rem;
			background: #fff;
			box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
			border-radius: 16px;
			animation: fadeIn 0.5s ease-in-out;
		  }
  
		  /* Typography */
		  h1 {
			font-size: 2rem;
			margin-bottom: 1.5rem;
			text-align: center;
		  }
  
		  h2 {
			font-size: 1.5rem;
			margin-top: 2rem;
		  }
  
		  /* Form Styles */
		  form {
			display: flex;
			flex-direction: column;
			gap: 1rem;
		  }
  
		  input[type="file"] {
			padding: 0.75rem;
			border: 2px solid #ddd;
			border-radius: 8px;
			outline: none;
			transition: border 0.3s ease;
			cursor: pointer;
		  }
  
		  input[type="file"]:focus {
			border-color: #4A90E2;
		  }
  
		  button {
			padding: 0.75rem 1.5rem;
			font-size: 1rem;
			color: #fff;
			background: #4A90E2;
			border: none;
			border-radius: 8px;
			cursor: pointer;
			transition: background 0.3s ease;
		  }
  
		  button:hover {
			background: #357ABD;
		  }
  
		  /* File List */
		  ul {
			list-style: none;
			padding: 0;
			margin-top: 1rem;
		  }
  
		  li {
			margin: 0.5rem 0;
			padding: 0.75rem;
			background: #f3f3f3;
			border-radius: 8px;
			transition: background 0.3s ease;
		  }
  
		  li a {
			text-decoration: none;
			color: #4A90E2;
			font-weight: 500;
			transition: color 0.3s ease;
		  }
  
		  li a:hover {
			color: #357ABD;
		  }
  
		  /* Animation */
		  @keyframes fadeIn {
			from {
			  opacity: 0;
			}
			to {
			  opacity: 1;
			}
		  }
		</style>
	  </head>
  
	  <body>
		<div class="container">
		  <h1>Upload File to R2</h1>
		  <form id="uploadForm" enctype="multipart/form-data">
			<input type="file" name="file" required />
			<button type="submit">Upload</button>
		  </form>
  
		  <h2>Uploaded Files:</h2>
		  <ul id="fileList">Loading...</ul>
		</div>
  
		<script>
		  const form = document.getElementById('uploadForm');
		  const fileList = document.getElementById('fileList');
  
		  form.addEventListener('submit', async (e) => {
			e.preventDefault();
			const formData = new FormData(form);
			const response = await fetch('/upload', {
			  method: 'POST',
			  body: formData
			});
			alert(await response.text());
			loadFiles();
		  });
  
		  async function loadFiles() {
			fileList.innerHTML = '';
			const response = await fetch('/list');
			const files = await response.json();
			if (files.length === 0) {
			  fileList.innerHTML = '<li>No files uploaded yet.</li>';
			} else {
			  files.forEach(file => {
				const li = document.createElement('li');
				const link = document.createElement('a');
				link.href = '/download/' + encodeURIComponent(file.name);
				link.textContent = file.name;
				li.appendChild(link);
				fileList.appendChild(li);
			  });
			}
		  }
  
		  loadFiles();
		</script>
	  </body>
  
	  </html>
	`;
  }
  
  // Handle file upload to R2
  async function handleUpload(request, env) {
	const formData = await request.formData();
	const file = formData.get("file");
  
	if (!file) {
	  return new Response("No file uploaded", { status: 400 });
	}
  
	const objectName = file.name;
	await env.MY_BUCKET.put(objectName, file.stream());
  
	return new Response(`File ${objectName} uploaded successfully!`);
  }
  
  // List files in the R2 bucket
  async function listFiles(env) {
	const files = [];
	for await (const object of env.MY_BUCKET.list()) {
	  files.push({ name: object.key });
	}
  
	return new Response(JSON.stringify(files), {
	  headers: { "Content-Type": "application/json" },
	});
  }
  
  // Download a file from R2
  async function downloadFile(env, filename) {
	const object = await env.MY_BUCKET.get(filename);
	if (!object) {
	  return new Response("File not found", { status: 404 });
	}
  
	return new Response(object.body, {
	  headers: {
		"Content-Type": "application/octet-stream",
		"Content-Disposition": `attachment; filename="${filename}"`,
	  },
	});
  }
