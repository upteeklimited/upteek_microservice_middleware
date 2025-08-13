import { Controller, All, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { ProxyService } from './proxy.service';
import axios from 'axios';
import * as multer from 'multer';
import * as FormData from 'form-data';
import * as fs from 'fs';
import {
  UPLOAD_SIZE_LIMIT,
  PROXY_TIMEOUT_MS,
  PROXY_MAX_BODY_SIZE,
} from '../utils/constants';
import * as path from 'path';
import { encrypt, decrypt } from '../utils/crypto';

// Ensure upload directory exists
const uploadDir = './upload';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
  limits: { fileSize: UPLOAD_SIZE_LIMIT },
});

// ✅ Recursive deep decryption function
function deepDecrypt(input: any): any {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (parsed && parsed.data && parsed.iv && parsed.tag) {
        return decrypt(parsed);
      }
    } catch {
      return input;
    }
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => deepDecrypt(item));
  }
  if (typeof input === 'object' && input !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = deepDecrypt(value);
    }
    return result;
  }
  return input;
}

@Controller()
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @All('*')
  async handleAll(@Req() req: Request, @Res() res: Response) {
    const type = this.proxyService.detectRequestType(req);
    const { targetUrl } = this.proxyService.getTargetUrl(req);

    if (type === 'json' || type === 'unknown') {
      try {
        if (!req.body || !req.body.data || !req.body.iv || !req.body.tag) {
          const safeHeaders = { ...req.headers };
          delete safeHeaders['host'];
          delete safeHeaders['content-length'];
          delete safeHeaders['accept-encoding'];
          delete safeHeaders['connection'];
          delete safeHeaders['transfer-encoding'];

          const axiosConfig = {
            method: req.method as any,
            url: targetUrl,
            headers: safeHeaders,
            data: req.body,
            params: req.query,
            timeout: PROXY_TIMEOUT_MS,
            validateStatus: () => true,
          };

          console.log('Proxy Outgoing Request:', {
            method: req.method,
            url: targetUrl,
            headers: safeHeaders,
            body: req.body,
          });

          const response = await axios(axiosConfig);
          console.log('Proxy Outgoing Request response:', response);
          const encryptedResponse = encrypt(JSON.stringify(response.data));
          return res.status(response.status).json(encryptedResponse);
        }

        // Encrypted JSON request
        const { data, iv, tag } = req.body;
        const decrypted = decrypt({ data, iv, tag });
        const decryptedBody = JSON.parse(decrypted);

        const safeHeaders = { ...req.headers };
        delete safeHeaders['host'];
        delete safeHeaders['content-length'];
        delete safeHeaders['accept-encoding'];
        delete safeHeaders['connection'];
        delete safeHeaders['transfer-encoding'];

        const axiosConfig = {
          method: req.method as any,
          url: targetUrl,
          headers: safeHeaders,
          data: decryptedBody,
          params: req.query,
          timeout: PROXY_TIMEOUT_MS,
          validateStatus: () => true,
        };

        console.log('Other Proxy Outgoing Request:', {
          method: req.method,
          url: targetUrl,
          headers: safeHeaders,
          body: decryptedBody,
        });

        const response = await axios(axiosConfig);
        console.log('Other Proxy Outgoing Request response:', response);
        const encryptedResponse = encrypt(JSON.stringify(response.data));
        return res.status(response.status).json(encryptedResponse);
      } catch (error) {
        console.log('Other Proxy Outgoing Request error:', error.response);
        if (error.response) {
          return res.status(error.response.status).send(error.response.data);
        } else {
          return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            message: 'Proxy error',
            error: error.message,
          });
        }
      }
    }

    if (type === 'form-data') {
      upload.any()(req, res, async (err) => {
        if (err) {
          return res.status(HttpStatus.BAD_REQUEST).json({
            message: 'Form-data parsing error',
            error: err.message,
          });
        }

        // Cleanup helper
        const cleanupFiles = () => {
          if (req.files) {
            (req.files as Express.Multer.File[]).forEach((file) => {
              fs.unlink(path.resolve(file.path), (err) => {
                if (err) console.error('Error deleting file:', err);
              });
            });
          }
        };

        try {
          // ✅ Deep decrypt all body fields
          req.body = deepDecrypt(req.body);

          const safeHeaders = { ...req.headers };
          delete safeHeaders['host'];
          delete safeHeaders['content-length'];
          delete safeHeaders['accept-encoding'];
          delete safeHeaders['connection'];
          delete safeHeaders['transfer-encoding'];
          delete safeHeaders['content-type']; // Let FormData set it

          // ✅ Build FormData
          const form = new FormData();
          Object.entries(req.body).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              value.forEach((item) => {
                form.append(
                  key,
                  typeof item === 'object'
                    ? JSON.stringify(item)
                    : String(item),
                );
              });
            } else if (typeof value === 'object' && value !== null) {
              form.append(key, JSON.stringify(value));
            } else {
              form.append(key, String(value));
            }
          });

          // Append files (no decryption here)
          if (req.files) {
            (req.files as Express.Multer.File[]).forEach((file) => {
              form.append(file.fieldname, fs.createReadStream(file.path), {
                filename: file.originalname,
                contentType: file.mimetype,
              });
            });
          }

          Object.assign(safeHeaders, form.getHeaders());

          console.log('Proxy Outgoing Multipart Request:', {
            method: req.method,
            url: targetUrl,
            headers: safeHeaders,
            fields: req.body,
            files: req.files,
          });

          const axiosConfig = {
            method: req.method as any,
            url: targetUrl,
            headers: safeHeaders,
            data: form,
            params: req.query,
            maxContentLength: PROXY_MAX_BODY_SIZE,
            maxBodyLength: PROXY_MAX_BODY_SIZE,
            timeout: PROXY_TIMEOUT_MS,
            validateStatus: () => true,
          };

          const response = await axios(axiosConfig);
          console.log('Proxy Outgoing Multipart response:', response);
          const encryptedResponse = encrypt(JSON.stringify(response.data));
          res.status(response.status).json(encryptedResponse);
          cleanupFiles();
        } catch (error) {
          cleanupFiles();
          if (error.response) {
            return res.status(error.response.status).send(error.response.data);
          } else {
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
              message: 'Proxy error',
              error: error.message,
            });
          }
        }
      });
      return;
    }
  }
}
