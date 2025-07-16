# Gateway Refactoring Documentation

## Overview

The gateways have been refactored to centralize common logic while keeping them modular and separated by concern. This architecture provides:

- **Centralized Connection Management**: All connection handling is managed by the `PresenceService`
- **Shared Base Gateway**: Common functionality is provided by the `BaseGateway` class
- **Modular Design**: Each gateway focuses only on its specific domain logic
- **Reusable Components**: Common services can be shared across all gateways
- **Namespace Isolation**: Each gateway operates in its own namespace for better organization
- **Flexible Authentication**: Clients can provide authentication data at any time during their session
- **WebSocket Authentication**: Bearer token authentication with backend server integration
- **Public/Private Namespaces**: Support for both authenticated and public WebSocket connections

## Architecture

### 1. PresenceService (`src/gateways/shared/presence.service.ts`)

Central service that manages:

- User ↔ socket mappings
- Connection lifecycle hooks
- Room management logic
- Client data tracking
- Namespace-based organization
- Dynamic client data updates

**Key Features:**

- `registerClient()` / `unregisterClient()` - Connection lifecycle
- `updateClientData()` - Update client information after initial connection
- `addClientToRoom()` / `removeClientFromRoom()` - Room management
- `getUserSockets()` - Get all sockets for a user
- `getNamespaceClients()` - Get all clients for a namespace
- `hasClientTypeInRoom()` - Check room composition
- `disconnectRoom()` - Force disconnect all clients in a room
- `getNamespaceStats()` - Get namespace-specific statistics
- `emitServerMessage()` - Emit message to all connected clients
- `emitClientMessage()` - Emit message to a specific client
- `isClientConnected()` - Check if client is still connected

**User ID Normalization:**

- All user IDs are normalized to strings internally for registration and lookup.
- This ensures that userId `5` and userId `'5'` are treated as the same user.
- All methods that accept or return userId (such as `registerClient`, `getConnectedClientByUserId`, etc.) will work reliably regardless of whether you pass a number or a string.

**Client Listing Utilities:**

- `getAllConnectedClients()`: Returns an array of all connected clients, each with their `clientId` and `data` (ClientData).
- `getAllConnectedClientsWithIds()`: Alias for `getAllConnectedClients()`.
- `getConnectedClientByUserId(userId)`: Returns all connected clients for a given userId (as string or number), each with their `clientId` and `data`.

**Example:**

```typescript
// List all connected clients
const allClients = presenceService.getAllConnectedClients();
// [{ clientId: 'socketid1', data: { userId: '5', ... } }, ...]

// List all connected clients for a user (works for number or string)
const userClients = presenceService.getConnectedClientByUserId(5);
// [{ clientId: 'socketid1', data: { userId: '5', ... } }, ...]
```

**Single Active Connection per User:**

// Only one active connection per userId is allowed at a time, across all namespaces.
// When a new connection is made for a user, all previous sockets for that user are disconnected and unregistered.
// This ensures that a user can only be online from one socket at a time, regardless of namespace.

### 2. BaseGateway (`src/gateways/shared/base.gateway.ts`)

Abstract base class that provides:

- Common connection handling (`handleConnection`, `handleDisconnect`)
- Authentication utilities (`isAuthenticated`, `extractUserId`)
- Message broadcasting utilities (`emitToRoom`, `emitToClient`, `broadcast`)
- Client data access (`getClientData`)
- Namespace extraction (`extractNamespace`)
- Client data updates (`updateClientData`)
- Client message emission (`emitClientMessage`)

### 3. WebSocket Authentication System

#### AuthService (`src/gateways/services/auth.service.ts`)

- Bearer token verification with backend server
- **Target URL resolution** based on client type (admin/user/bank)
- User data extraction and validation
- Role and permission checking
- Synchronous token verification for guards
- **Dynamic server selection** using environment variables (ADMIN, USERS, BANK)

#### WebSocketAuthGuard (`src/gateways/guards/websocket-auth.guard.ts`)

- Validates bearer tokens on connection
- Enforces client type requirements (`x-client-type` header)
- Supports public namespaces (no authentication required)
- Stores user data in socket for later use

#### Public Decorator (`src/gateways/decorators/public.decorator.ts`)

- `@PublicWebSocket()` - Marks gateway as public (no auth required)
- `@WebSocketAuth(options)` - Configures authentication options

### 4. Domain-Specific Gateways

Each gateway extends `BaseGateway` and operates in its own namespace:

#### VerificationGateway (`/verification` namespace) - **PUBLIC**

- Handles verification room creation and management
- Manages mobile/web client pairing
- Processes verification-specific events
- Updates client data when userId is provided in `join_room` message
- **No authentication required** - marked with `@PublicWebSocket()`

#### MessagesGateway (`/messages` namespace) - **AUTHENTICATED**

- Handles chat room management with **sorter method** for consistent room names
- Processes message events
- Manages user presence in chat rooms
- Handles anonymous clients and updates their data when userId becomes available
- **Requires authentication** - protected by `@UseGuards(WebSocketAuthGuard)`
- **Smart room creation**: First person creates room, second person joins existing room
- **Consistent room naming**: Room names are always sorted alphabetically regardless of join order

#### P2P Room Restrictions and Message Broadcasting (NEW)

- **P2P Room Limit**: Each chat room can have at most 2 different users. If a third user attempts to join, they will be rejected unless they are the same user joining from another device or tab.
- **Multiple Devices/Tabs**: The same user can join the same room from multiple devices or browser tabs.
- **User Validation**: When joining a room, the system checks if the user is already present. If not, and the room already has 2 different users, the join is rejected.
- **Room-Based Messaging**: Messages are now broadcast to the entire room using `emitToRoom`, ensuring both users (and all their devices/tabs) receive the message in real-time.
- **No Group Chat**: Only P2P (one-on-one) chats are supported. Group chats with more than 2 users are not allowed.

##### Example: P2P Room Join and Messaging

```javascript
// User A joins the room
messagesSocket.emit('join_chat', {
  clientType: 'web',
  client_a: 'userA',
  client_b: 'userB'
});

// User B joins the same room
messagesSocket.emit('join_chat', {
  clientType: 'web',
  client_a: 'userB',
  client_b: 'userA'
});

// User A sends a message (received by both A and B)
messagesSocket.emit('message', {
  text: 'Hello from A!'
});
```

##### Error Example: Room Full

```javascript
// User C tries to join the same room
messagesSocket.emit('join_chat', {
  clientType: 'web',
  client_a: 'userC',
  client_b: 'userA'
});
// Response:
// { success: false, message: 'Room is full. Only 2 users allowed in P2P chat rooms.' }
```

##### Summary
- Use `join_chat` to join a P2P room. Only 2 different users allowed.
- Use `message` to send messages to the room. All devices/tabs for both users receive the message.
- Attempts to join a full room by a third user will be rejected.

#### Peer Notification on Message (UPDATED)

- When a user sends a message in a chat room, the server identifies the other user in the room (based on the room name).
- If the other user is online (has active sockets), the server emits a `peer_joined` event to all of their sockets.
- The payload includes the room name, the peer's userId, and a timestamp.

##### Example: Peer Notification

```javascript
// Client-side: Listen for peer_joined event
messagesSocket.on('peer_joined', (data) => {
  console.log('Your chat partner has sent a message:', data);
  // data = {
  //   message: 'Your chat partner has sent a message in room: chat_room_admin456_user123',
  //   roomName: 'chat_room_admin456_user123',
  //   peerUserId: 'user123',
  //   timestamp: '...'
  // }
});
```

### Client Examples

```javascript
// First person joining (creates room)
messagesSocket.emit('join_chat', {
  clientType: 'user',
  client_a: 'user123',
  client_b: 'admin456'
});

// Second person joining (joins existing room)
messagesSocket.emit('join_chat', {
  clientType: 'admin',
  client_a: 'admin456',  // Can be in reverse order
  client_b: 'user123'    // Room name will still be consistent
});

// Both will be in the same room: "chat_room_admin456_user123"
```

#### Event Responses

**First Person (Room Creator):**
```javascript
{
  success: true,
  message: "Created chat room: chat_room_admin456_user123",
  roomName: "chat_room_admin456_user123",
  isFirstPerson: true
}
```

**Second Person (Room Joiner):**
```javascript
{
  success: true,
  message: "Joined chat room: chat_room_admin456_user123",
  roomName: "chat_room_admin456_user123",
  isFirstPerson: false
}
```

#### Error Handling

**Missing Fields:**
```javascript
{
  success: false,
  message: "Missing required fields: clientType, client_a, client_b"
}
```

**Invalid Client Type:**
```javascript
{
  success: false,
  message: "Invalid client type. Must be one of: admin, user, bank"
}
```

#### Leave Chat

```javascript
// Leave a chat room
messagesSocket.emit('leave_chat', {
  client_a: 'user123',
  client_b: 'admin456'
});
```

### Client-Side Connection

#### Public Namespace

```javascript
// Connect to verification namespace (no auth required)
const verificationSocket = io('http://localhost:3000/verification', {
  headers: {
    'x-client-type': 'user' // Optional but recommended (admin/user/bank)
  }
});
```

// Provide authentication data later
verificationSocket.emit('join_room', {
  userId: 'user123',
  clientType: 'web'
});
```

#### Private Namespace

```javascript
// Connect to messages namespace (auth required)
const messagesSocket = io('http://localhost:3000/messages', {
  headers: {
    'Authorization': 'Bearer your-jwt-token-here',
    'x-client-type': 'user' // Required (admin/user/bank)
  }
});

// Alternative: Using auth object
const messagesSocket = io('http://localhost:3000/messages', {
  auth: {
    token: 'your-jwt-token-here',
    clientType: 'user'
  }
});
```

### Handling Anonymous Clients

```typescript
@SubscribeMessage('authenticate')
handleAuthentication(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { userId: string; clientType: string }
) {
  // Update anonymous client with real authentication data
  this.updateClientData(client.id, {
    userId: payload.userId,
    clientType: payload.clientType
  });

  // Send welcome message to the authenticated client
  this.emitClientMessage(client.id, 'Authentication successful', {
    userId: payload.userId,
    timestamp: new Date().toISOString()
  });

  return { success: true, message: 'Authentication successful' };
}
```

## Root Namespace Gateway (`/`)

### RootGateway (`/` namespace) - **ANONYMOUS & AUTH SUPPORTED**

- Handles all connections to the root namespace (`/`).
- Registers all clients, even if they do not provide authentication data or clientType.
- Clients are tracked as anonymous unless they authenticate later.
- Supports broadcasting to all root clients and sending messages to specific socketIds/userIds.
- Inherits all connection/disconnection logic from `BaseGateway`.

#### Example: Connecting to Root Namespace

```javascript
// Connect to root namespace (no auth required)
const rootSocket = io('http://localhost:3000/');

// Optionally, authenticate after connecting
rootSocket.emit('authenticate', {
  userId: 'user123',
  clientType: 'web',
});
```

#### Example: Authenticate Event Handler

```typescript
@SubscribeMessage('authenticate')
handleAuthenticate(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { userId: string; clientType?: string },
) {
  this.updateClientAuth(client, payload.userId, payload.clientType);
  return { success: true, message: 'Authenticated' };
}
```

### Updated BaseGateway Connection Logic

- On connection, `BaseGateway` now registers the client with `userId` and `clientType` if provided, or as anonymous otherwise.
- This logic is used by all gateways, including the root.

#### Example: Flexible Registration

```typescript
handleConnection(client: Socket): void {
  const userId = this.extractUserId(client) || 'anonymous';
  const clientType = this.extractClientType(client);
  const namespace = this.extractNamespace(client);
  this.presenceService.registerClient(client.id, {
    userId,
    clientType,
    namespace,
  });
}
```

### Summary Table: Authentication Methods

| Namespace         | At Connection (token/clientType) | After Connection (event)         |
|-------------------|----------------------------------|----------------------------------|
| `/messages`       | Yes (via headers/auth)            | No (must connect with auth)      |
| `/verification`   | No (public)                       | Yes (`join_room` event)          |
| `/` (root)        | No (anonymous by default)         | Yes (`authenticate` event)       |

- **All clients are registered and tracked, even if anonymous.**
- **Authentication can be performed after connection for root and public namespaces.**
- **Client data (userId/clientType) can be updated at any time.**

## Troubleshooting

### Common Issues

#### 1. Client Data is Undefined

**Problem**: `clientData` is `undefined` when trying to unregister a client.

**Solution**: This was fixed by ensuring all clients are registered immediately upon connection, even without authentication data.

#### 2. Authentication Timing Issues

**Problem**: Clients need to provide authentication data during connection.

**Solution**: Clients can now provide authentication data at any time using `updateClientData()`.

#### 3. Namespace Isolation

**Problem**: Events from one namespace affecting another.

**Solution**: Each gateway operates in its own namespace, providing complete isolation.

#### 4. Authentication Failures

**Problem**: WebSocket connections failing due to authentication issues.

**Solution**:

- Ensure bearer token is valid and not expired
- Verify `x-client-type` header is provided and valid
- Check auth server is accessible and responding
- Use `@PublicWebSocket()` for namespaces that don't require authentication

#### 5. Token Verification Issues

**Problem**: Token verification failing or timing out.

**Solution**:

- Verify `AUTH_SERVER_URL` environment variable is set correctly
- Ensure auth server endpoint `/api/auth/verify` is available
- Check network connectivity to auth server
- Review auth server logs for verification failures

### Debugging

Enable debug logging to track client lifecycle:

```typescript
// Connection logs
console.log(`Socket connected: ${client.id}`);
console.log(`Connection details - userId: ${userId}, clientType: ${clientType}, namespace: ${namespace}`);

// Authentication logs
console.log(`Authentication successful for client ${client.id}, user: ${userData.userId}`);
console.log(`Authentication failed for client ${client.id}: ${error.message}`);

// Registration logs
console.log(`Client ${client.id} registered successfully`);

// Update logs
console.log(`Client ${client.id} data updated:`, updates);

// Disconnection logs
console.log(`Socket disconnected: ${client.id}`);
console.log(`Unregistering client ${client.id} with data:`, clientData);
```

## Benefits

1. **DRY Principle**: No code duplication across gateways
2. **Consistency**: All gateways handle connections the same way
3. **Maintainability**: Changes to connection logic only need to be made in one place
4. **Scalability**: Easy to add new gateways with consistent behavior
5. **Modularity**: Each gateway focuses only on its specific domain logic
6. **Namespace Isolation**: Clear separation between different features
7. **Better Organization**: Events and rooms are organized by namespace
8. **Enhanced Monitoring**: Namespace-specific statistics and monitoring
9. **Flexible Authentication**: Clients can authenticate at any time
10. **Robust Error Handling**: No more undefined client data issues
11. **Security**: Bearer token authentication with backend integration
12. **Client Type Validation**: Enforces proper client identification
13. **Public/Private Support**: Flexible authentication requirements per namespace

## Migration Notes

- All existing gateway functionality has been preserved
- Gateways now operate in isolated namespaces (`/verification`, `/messages`)
- The `PresenceService` now tracks namespace information and supports dynamic updates
- Client connections must specify the appropriate namespace
- Namespace-specific statistics are available for monitoring
- **NEW**: All clients are registered immediately upon connection
- **NEW**: Client data can be updated at any time using `updateClientData()`
- **NEW**: Anonymous clients are supported with placeholder userId
- **NEW**: WebSocket authentication system with bearer token support
- **NEW**: Public/private namespace support with decorators
- **NEW**: Client type validation with `x-client-type` header
- **NEW**: Backend server integration for token verification
- The `VerificationService` has been simplified to focus on verification-specific logic
- The `MessagesService` has been enhanced with message processing capabilities
- Connection handling is now centralized in the `PresenceService`
