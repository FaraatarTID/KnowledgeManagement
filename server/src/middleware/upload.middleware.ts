import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// SECURITY: File upload validation
const ALLOWED_MIMETYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

// SECURITY: Additional extension validation to prevent MIME spoofing
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.md', '.xlsx', '.xls'];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Use crypto for secure random filename
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
  }
});

export const uploadMiddleware = multer({ 
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    // SECURITY: Validate both MIME type AND file extension
    const extension = path.extname(file.originalname).toLowerCase();
    
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return cb(new Error(`Invalid file extension: ${extension}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
    }
    
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      return cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: PDF, Word, Excel, Text, Markdown`));
    }

    // SECURITY: Additional check for executable signatures
    if (file.originalname.match(/\.(exe|bat|sh|js|py|zip|rar|7z)$/i)) {
      return cb(new Error('Executable or archive files are not allowed'));
    }

    cb(null, true);
  }
});
