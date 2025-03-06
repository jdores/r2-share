## Cloudflare worker to securely upload and download files from R2

This is a Cloudflare worker that presents a frontend to enable upload and download of files stored in a Cloudflare R2 bucket.

### Installation instructions

1. Create an R2 bucket in Cloudflare's dashboard. Do not make the bucket public, add a custom domain or enable the r2.dev subdomain
2. Before deploying this worker, edit the wrangler.jsonc file with the custom domain the worker should use, and the correct binding to the R2 bucket created in step 1
3. Create a Cloudflare Access Policy restricting access to the worker custom domain, so that only authorized people can access the R2 upload/download portal and interact with the R2 bucket.