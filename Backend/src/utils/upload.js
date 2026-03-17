import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

const provider = 'local'; // Force local provider

const localStorage = multer.memoryStorage();

const upload = multer({
  storage: localStorage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Dummy S3 function so imports don't break controllers
async function uploadToS3() {
  throw new Error("S3 upload not enabled. Set FILE_UPLOAD_PROVIDER=s3 to enable.");
}

export { upload, uploadToS3, provider as uploadProvider };
