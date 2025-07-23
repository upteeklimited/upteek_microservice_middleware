import * as FormData from 'form-data';

import { AuthService } from '../services/auth.service';
import { ClientData } from '../shared/presence.service';
import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class MessagesService {
  constructor(private readonly authService: AuthService) {}

  async processMessage(
    payload: string,
    receiver: any,
    clientData: ClientData,
    media?: string[],
    token?: string,
  ): Promise<string> {
    console.log(`Processing message from user ${clientData.userId}:`, payload);
    try {
      const targetUrl = this.authService.getTargetUrl(
        clientData.clientType || 'user',
      );
      const apiEndpoint = `${targetUrl}messages/create`;
      console.log(apiEndpoint);
      // Create FormData
      const formData = new FormData();
      formData.append('receiver_id', receiver);
      formData.append('body', payload);
      formData.append('media', media);
      // Prepare headers
      const headers = formData.getHeaders();
      if (token) {
        headers['Authorization'] = `${token}`;
      }
      // Remove unsafe headers
      delete headers['host'];
      delete headers['content-length'];
      delete headers['accept-encoding'];
      delete headers['connection'];
      delete headers['transfer-encoding'];
      console.dir(headers);
      // Send the message as multipart/form-data
      const response = await axios.post(apiEndpoint, formData, {
        headers,
      });
      return `Message sent to backend. Response: ${JSON.stringify(response.data)}`;
    } catch (error) {
      console.error('Error sending message to backend:', error);
      return `Failed to send message to backend: ${error.message}`;
    }
  }
}
