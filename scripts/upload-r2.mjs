import fs from "node:fs";
import path from "node:path";
import {
  S3Client,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const endpoint =
  "https://88f0ef4934bf046e6c9335bab3dfefab.r2.cloudflarestorage.com";

const bucket = "clickit-downloads";
const key = "windows/ClickIT-Setup-0.1.2.exe";
const filePath = path.resolve("release/ClickIT Setup 0.1.2.exe");

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  throw new Error("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY ausentes.");
}

if (!fs.existsSync(filePath)) {
  throw new Error(`Instalador não encontrado: ${filePath}`);
}

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const stat = fs.statSync(filePath);

console.log(`Arquivo: ${filePath}`);
console.log(`Bytes locais: ${stat.size}`);
console.log("Iniciando multipart upload...");

const upload = new Upload({
  client,
  params: {
    Bucket: bucket,
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentType: "application/vnd.microsoft.portable-executable",
    ContentDisposition: 'attachment; filename="ClickIT Setup 0.1.2.exe"',
    CacheControl: "public, max-age=31536000, immutable",
  },
  queueSize: 4,
  partSize: 10 * 1024 * 1024,
  leavePartsOnError: false,
});

let lastPercent = -1;

upload.on("httpUploadProgress", ({ loaded, total }) => {
  if (!total) return;

  const percent = Math.floor((loaded / total) * 100);

  if (percent !== lastPercent) {
    lastPercent = percent;
    console.log(`${percent}%`);
  }
});

await upload.done();

const head = await client.send(
  new HeadObjectCommand({
    Bucket: bucket,
    Key: key,
  }),
);

console.log("");
console.log("UPLOAD CONCLUÍDO");
console.log(`Remote bytes: ${head.ContentLength}`);
console.log(`ETag: ${head.ETag}`);
console.log(`Content-Type: ${head.ContentType}`);
console.log(`Cache-Control: ${head.CacheControl}`);