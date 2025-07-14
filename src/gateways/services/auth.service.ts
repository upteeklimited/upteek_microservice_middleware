import * as jwt from 'jsonwebtoken';

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface UserData {
  id: string;
  email?: string;
  username?: string;
  role?: number;
  user_type?: number;
}

export interface TokenVerificationResponse {
  valid: boolean;
  user?: UserData;
  error?: string;
}

@Injectable()
export class AuthService {
  private readonly authServerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.authServerUrl =
      this.configService.get<string>('AUTH_SERVER_URL') ||
      'http://localhost:3000';
  }

  /**
   * Get target URL based on client type, following the same pattern as ProxyService
   */
  getTargetUrl(clientType: string): string {
    const SERVER_URLS = {
      admin: process.env.ADMIN || '',
      user: process.env.USERS || '',
      bank: process.env.BANK || '',
    };

    const userType = clientType.toLowerCase();
    if (!Object.keys(SERVER_URLS).includes(userType)) {
      throw new HttpException(
        'Invalid x-client-type header',
        HttpStatus.BAD_REQUEST,
      );
    }

    return SERVER_URLS[userType];
  }

  verifyJwtToken(token: string): TokenVerificationResponse {
    const secretKey = process.env.ACCESS_SECRET_KEY;
    if (!secretKey) {
      console.error('ACCESS_SECRET_KEY environment variable is not set');
      return null;
    }

    try {
      const decoded = jwt.verify(token, secretKey, {
        algorithms: ['HS256'], // or RS256
      });
      const _sub: any = decoded.sub;
      const sub = JSON.parse(_sub);
      const userData: UserData = {
        id: sub.id,
        email: sub.email,
        username: sub.username,
        role: sub.role,
        user_type: sub.user_type,
      };
      const verified: TokenVerificationResponse = {
        valid: true,
        user: userData,
        error: undefined,
      };
      return verified;
    } catch (err) {
      console.error('Invalid token:', err.message);
      return null;
    }
  }

  /**
   * Verify a bearer token with the appropriate backend server based on client type
   */
  //   async verifyToken(
  //     token: string,
  //     clientType: string,
  //   ): Promise<UserData | null> {
  //     try {
  //       const targetUrl = this.getTargetUrl(clientType);
  //       const verifyEndpoint = `${targetUrl}/api/auth/verify`;

  //       console.log(`Verifying token with auth server: ${verifyEndpoint}`);

  //       const response = await axios.post<TokenVerificationResponse>(
  //         verifyEndpoint,
  //         { token },
  //         {
  //           headers: {
  //             'Content-Type': 'application/json',
  //             Authorization: `Bearer ${token}`,
  //           },
  //           timeout: 5000, // 5 second timeout
  //         },
  //       );

  //       if (response.data.valid && response.data.user) {
  //         console.log(
  //           `Token verification successful for user: ${response.data.user.userId}`,
  //         );
  //         return response.data.user;
  //       } else {
  //         console.log(`Token verification failed: ${response.data.error}`);
  //         return null;
  //       }
  //     } catch (error) {
  //       console.error('Token verification error:', error.message);

  //       if (axios.isAxiosError(error)) {
  //         if (error.response?.status === 401) {
  //           console.log('Token is invalid or expired');
  //         } else if (error.response?.status === 403) {
  //           console.log('Token lacks required permissions');
  //         } else if (error.code === 'ECONNREFUSED') {
  //           console.log('Auth server is not available');
  //         } else if (error.code === 'ETIMEDOUT') {
  //           console.log('Auth server request timed out');
  //         }
  //       }

  //       return null;
  //     }
  //   }

  /**
   * Get user details from the target server using /auth/details endpoint
   * This is an async method that can be used for actual token verification
   */
  async getUserDetails(
    token: string,
    clientType: string,
  ): Promise<UserData | null> {
    try {
      const targetUrl = this.getTargetUrl(clientType);
      const detailsEndpoint = `${targetUrl}/auth/details`;

      console.log(`Making request to: ${detailsEndpoint}`);

      const response = await axios.get(detailsEndpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000, // 5 second timeout
      });

      if (response.data && response.data.user) {
        console.log(`User details retrieved for: ${response.data.user.userId}`);
        return response.data.user;
      }

      return null;
    } catch (error) {
      console.error('User details request error:', error.message);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          console.log('Token is invalid or expired');
        } else if (error.response?.status === 403) {
          console.log('Token lacks required permissions');
        } else if (error.code === 'ECONNREFUSED') {
          console.log('Auth server is not available');
        } else if (error.code === 'ETIMEDOUT') {
          console.log('Auth server request timed out');
        }
      }

      return null;
    }
  }

  /**
   * Extract user data from a socket connection
   */
  getUserFromSocket(socket: any): UserData | null {
    return socket.data?.user || null;
  }

  /**
   * Check if a user has a specific role
   */
  userType(user: UserData, type: number): boolean {
    return user.user_type === type;
  }
}
