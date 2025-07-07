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

// NOTE: Avoid using global body parsers for multipart routes. Only multer should handle multipart bodies.

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
          // Not encrypted, forward as-is, but encrypt the response
          const safeHeaders = { ...req.headers };
          delete safeHeaders['host'];
          delete safeHeaders['content-length'];
          delete safeHeaders['accept-encoding'];
          delete safeHeaders['connection'];
          delete safeHeaders['transfer-encoding'];

          console.log('Proxy Outgoing Request (unencrypted):', {
            method: req.method,
            url: targetUrl,
            headers: safeHeaders,
            body: req.body,
            query: req.query,
          });

          const axiosConfig = {
            method: req.method as any,
            url: targetUrl,
            headers: safeHeaders,
            data: req.body,
            params: req.query,
            timeout: PROXY_TIMEOUT_MS,
            validateStatus: () => true,
          };
          const response = await axios(axiosConfig);
          console.log('Proxy Response (unencrypted):', {
            status: response.status,
            headers: response.headers,
            data: response.data,
          });
          // Encrypt the response before sending
          const encryptedResponse = encrypt(JSON.stringify(response.data));
          res.status(response.status).json(encryptedResponse);
          return;
        }

        // Encrypted request
        const { data, iv, tag } = req.body;
        const decrypted = decrypt({ data, iv, tag });
        const decryptedBody = JSON.parse(decrypted);

        const safeHeaders = { ...req.headers };
        delete safeHeaders['host'];
        delete safeHeaders['content-length'];
        delete safeHeaders['accept-encoding'];
        delete safeHeaders['connection'];
        delete safeHeaders['transfer-encoding'];

        // console.log('Proxy Outgoing Request:', {
        //   method: req.method,
        //   url: targetUrl,
        //   headers: safeHeaders,
        //   body: decryptedBody,
        //   query: req.query,
        // });

        const axiosConfig = {
          method: req.method as any,
          url: targetUrl,
          headers: safeHeaders,
          data: decryptedBody,
          params: req.query,
          timeout: PROXY_TIMEOUT_MS,
          validateStatus: () => true,
        };
        const response = await axios(axiosConfig);
        console.log('Proxy Response:', {
          status: response.status,
          headers: response.headers,
          data: response.data,
        });
        // Encrypt response
        const encryptedResponse = encrypt(JSON.stringify(response.data));
        res.status(response.status).json(encryptedResponse);
      } catch (error) {
        if (error.response) {
          // console.log('Proxy Error Response:', {
          //   status: error.response.status,
          //   headers: error.response.headers,
          //   data: error.response.data,
          // });
          res.status(error.response.status).send(error.response.data);
        } else {
          // console.error('Proxy Error:', error);
          res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            message: 'Proxy error',
            error: error.message,
          });
        }
      }
      return;
    }

    if (type === 'form-data') {
      upload.any()(req, res, async (err) => {
        if (err) {
          console.error('Multer error:', err);
          return res
            .status(HttpStatus.BAD_REQUEST)
            .json({ message: 'Form-data parsing error', error: err.message });
        }
        // Helper to clean up uploaded files
        const cleanupFiles = () => {
          if (req.files) {
            (req.files as Express.Multer.File[]).forEach((file) => {
              const filePath = path.resolve(file.path);
              fs.unlink(filePath, (err) => {
                if (err) {
                  console.error('Error deleting uploaded file:', filePath, err);
                }
              });
            });
          }
        };
        try {
          // Decrypt all string fields in req.body
          Object.keys(req.body).forEach((key) => {
            try {
              const { data, iv, tag } = JSON.parse(req.body[key]);
              req.body[key] = decrypt({ data, iv, tag });
            } catch {
              // If not encrypted, leave as is
            }
          });

          const safeHeaders = { ...req.headers };
          delete safeHeaders['host'];
          delete safeHeaders['content-length'];
          delete safeHeaders['accept-encoding'];
          delete safeHeaders['connection'];
          delete safeHeaders['transfer-encoding'];
          delete safeHeaders['content-type']; // Ensure we use form-data's header

          // Build a new FormData instance
          const form = new FormData();
          // Append fields
          if (req.body) {
            Object.entries(req.body).forEach(([key, value]) => {
              form.append(key, value as any);
            });
          }
          // Append files
          if (req.files) {
            (req.files as Express.Multer.File[]).forEach((file) => {
              form.append(file.fieldname, fs.createReadStream(file.path), {
                filename: file.originalname,
                contentType: file.mimetype,
              });
            });
          }

          // Set the correct content-type header for form-data
          Object.assign(safeHeaders, form.getHeaders());

          // console.log('Proxy Outgoing Multipart Request:', {
          //   method: req.method,
          //   url: targetUrl,
          //   headers: safeHeaders,
          //   fields: req.body,
          //   files: req.files,
          //   query: req.query,
          // });

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
          // console.log('Proxy Multipart Response:', {
          //   status: response.status,
          //   headers: response.headers,
          //   data: response.data,
          // });
          // Encrypt response
          const encryptedResponse = encrypt(JSON.stringify(response.data));
          res.status(response.status).json(encryptedResponse);
          cleanupFiles();
        } catch (error) {
          if (error.response) {
            console.log('Proxy Multipart Error Response:', {
              status: error.response.status,
              headers: error.response.headers,
              data: error.response.data,
            });
            res.status(error.response.status).send(error.response.data);
          } else {
            console.error('Proxy Multipart Error:', error);
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
              message: 'Proxy error',
              error: error.message,
            });
          }
          cleanupFiles();
        }
      });
      return;
    }

    // console.log('content type: ' + type);
    // // Not implemented for other requests
    // console.log('Not implemented request headers:', {
    //   method: req.method,
    //   url: targetUrl,
    //   headers: req.headers,
    //   body: req.body,
    //   query: req.query,
    // });
    // res.status(HttpStatus.NOT_IMPLEMENTED).json({
    //   message:
    //     'Only JSON and multipart/form-data requests are currently supported by the server.',
    // });
  }
}
