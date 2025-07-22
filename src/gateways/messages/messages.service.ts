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
      // Prepare JSON payload
      const jsonPayload = {
        receiver_id: receiver,
        body: payload,
        media: media,
      };
      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `${token}`;
      }
      // Send the message as JSON
      const response = await axios.post(apiEndpoint, jsonPayload, {
        headers,
      });
      return response.data.data;
      // return `Message sent to backend. Response: ${JSON.stringify(response.data)}`;
    } catch (error) {
      console.error('Error sending message to backend:', error);
      return `Failed to send message to backend: ${error.message}`;
    }
  }
}
