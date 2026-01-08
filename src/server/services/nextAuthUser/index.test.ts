import { LobeChatDatabase } from '@lobechat/database';
import { AdapterAccount, AdapterUser } from 'next-auth/adapters';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserModel } from '@/database/models/user';
import {
  UserItem,
  nextauthAccounts,
  nextauthAuthenticators,
  nextauthSessions,
  nextauthVerificationTokens,
  users,
} from '@/database/schemas';
import { pino } from '@/libs/logger';

import { NextAuthUserService } from './index';

// Mock dependencies
vi.mock('@/database/models/user', () => {
  const MockUserModel = vi.fn();
  // @ts-expect-error - Mock static methods
  MockUserModel.findById = vi.fn();
  // @ts-expect-error - Mock static methods
  MockUserModel.findByEmail = vi.fn();
  // @ts-expect-error - Mock static methods
  MockUserModel.createUser = vi.fn();
  // @ts-expect-error - Mock static methods
  MockUserModel.deleteUser = vi.fn();

  // Mock instance methods
  MockUserModel.prototype.updateUser = vi.fn();

  return { UserModel: MockUserModel };
});

vi.mock('@/libs/logger', () => ({
  pino: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Create mock database with chainable methods
const createMockDB = () => {
  const mockReturning = vi.fn().mockResolvedValue([{ id: 'test-id' }]);
  const mockThen = vi.fn((cb) => Promise.resolve(cb([{ id: 'test-id' }])));
  const mockWhere = vi.fn().mockReturnValue({
    returning: mockReturning,
    then: mockThen,
  });
  const mockValues = vi.fn().mockReturnValue({
    returning: mockReturning,
    then: mockThen,
  });
  const mockSet = vi.fn().mockReturnValue({
    where: mockWhere,
    returning: mockReturning,
  });
  const mockInnerJoin = vi.fn().mockReturnValue({
    where: mockWhere,
    then: mockThen,
  });
  const mockFrom = vi.fn().mockReturnValue({
    where: mockWhere,
    innerJoin: mockInnerJoin,
    then: mockThen,
  });

  return {
    select: vi.fn().mockReturnValue({
      from: mockFrom,
      then: mockThen,
    }),
    insert: vi.fn().mockReturnValue({
      values: mockValues,
    }),
    update: vi.fn().mockReturnValue({
      set: mockSet,
    }),
    delete: vi.fn().mockReturnValue({
      where: mockWhere,
    }),
  } as unknown as LobeChatDatabase;
};

let service: NextAuthUserService;
let mockDB: LobeChatDatabase;

const mockAdapterUser: AdapterUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  emailVerified: new Date('2024-01-01'),
  name: 'Test User',
  image: 'https://example.com/avatar.jpg',
};

const mockLobeUser: UserItem = {
  id: 'test-user-id',
  email: 'test@example.com',
  emailVerifiedAt: new Date('2024-01-01'),
  fullName: 'Test User',
  avatar: 'https://example.com/avatar.jpg',
  firstName: null,
  lastName: null,
  username: null,
  phone: null,
  clerkCreatedAt: null,
  preference: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  normalizedEmail: null,
  interests: null,
  isOnboarded: false,
  onboarding: null,
  emailVerified: true,
  role: null,
  banned: false,
  banReason: null,
  banExpires: null,
  twoFactorEnabled: false,
  phoneNumberVerified: null,
  lastActiveAt: new Date(),
  accessedAt: new Date(),
};

beforeEach(() => {
  mockDB = createMockDB();
  service = new NextAuthUserService(mockDB);
  vi.clearAllMocks();
});

describe('NextAuthUserService', () => {
  describe('createUser', () => {
    it('should create a new user when user does not exist', async () => {
      vi.mocked(UserModel.findByEmail).mockResolvedValue(undefined);
      vi.mocked(UserModel.findById).mockResolvedValue(undefined);
      vi.mocked(UserModel.createUser).mockResolvedValue({} as any);

      const result = await service.createUser(mockAdapterUser);

      expect(UserModel.findByEmail).toHaveBeenCalledWith(mockDB, mockAdapterUser.email);
      expect(UserModel.createUser).toHaveBeenCalledWith(
        mockDB,
        expect.objectContaining({
          id: mockAdapterUser.id,
          email: mockAdapterUser.email,
          fullName: mockAdapterUser.name,
          avatar: mockAdapterUser.image,
        }),
      );
      expect(result).toMatchObject({
        id: mockAdapterUser.id,
        email: mockAdapterUser.email,
      });
    });

    it('should return existing user when found by email', async () => {
      vi.mocked(UserModel.findByEmail).mockResolvedValue(mockLobeUser);

      const result = await service.createUser(mockAdapterUser);

      expect(UserModel.findByEmail).toHaveBeenCalledWith(mockDB, mockAdapterUser.email);
      expect(UserModel.createUser).not.toHaveBeenCalled();
      expect(result.id).toBe(mockLobeUser.id);
    });

    it('should return existing user when found by providerAccountId', async () => {
      vi.mocked(UserModel.findByEmail).mockResolvedValue(undefined);
      vi.mocked(UserModel.findById).mockResolvedValue(mockLobeUser);

      const userWithProviderId = {
        ...mockAdapterUser,
        providerAccountId: 'provider-123',
      };

      const result = await service.createUser(userWithProviderId);

      expect(UserModel.findById).toHaveBeenCalledWith(mockDB, 'provider-123');
      expect(UserModel.createUser).not.toHaveBeenCalled();
      expect(result.id).toBe(mockLobeUser.id);
    });

    it('should use providerAccountId as user id when provided', async () => {
      vi.mocked(UserModel.findByEmail).mockResolvedValue(undefined);
      vi.mocked(UserModel.findById).mockResolvedValue(undefined);
      vi.mocked(UserModel.createUser).mockResolvedValue({} as any);

      const userWithProviderId = {
        ...mockAdapterUser,
        providerAccountId: 'provider-123',
      };

      const result = await service.createUser(userWithProviderId);

      expect(UserModel.createUser).toHaveBeenCalledWith(
        mockDB,
        expect.objectContaining({
          id: 'provider-123',
        }),
      );
      expect(result.id).toBe('provider-123');
    });

    it('should skip finding by email when email is empty or whitespace', async () => {
      vi.mocked(UserModel.findByEmail).mockResolvedValue(undefined);
      vi.mocked(UserModel.findById).mockResolvedValue(undefined);
      vi.mocked(UserModel.createUser).mockResolvedValue({} as any);

      const userWithEmptyEmail = {
        ...mockAdapterUser,
        email: '   ',
      };

      await service.createUser(userWithEmptyEmail);

      expect(UserModel.findByEmail).not.toHaveBeenCalled();
    });
  });

  describe('getUserByEmail', () => {
    it('should return user when found by email', async () => {
      vi.mocked(UserModel.findByEmail).mockResolvedValue(mockLobeUser);

      const result = await service.getUserByEmail('test@example.com');

      expect(UserModel.findByEmail).toHaveBeenCalledWith(mockDB, 'test@example.com');
      expect(result).toMatchObject({
        id: mockLobeUser.id,
        email: mockLobeUser.email,
      });
    });

    it('should return null when user not found', async () => {
      vi.mocked(UserModel.findByEmail).mockResolvedValue(undefined);

      const result = await service.getUserByEmail('notfound@example.com');

      expect(result).toBeNull();
    });

    it('should return null when email is empty', async () => {
      const result = await service.getUserByEmail('');

      expect(UserModel.findByEmail).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null when email is whitespace', async () => {
      const result = await service.getUserByEmail('   ');

      expect(UserModel.findByEmail).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('getUser', () => {
    it('should return user when found by id', async () => {
      vi.mocked(UserModel.findById).mockResolvedValue(mockLobeUser);

      const result = await service.getUser('test-user-id');

      expect(UserModel.findById).toHaveBeenCalledWith(mockDB, 'test-user-id');
      expect(result).toMatchObject({
        id: mockLobeUser.id,
        email: mockLobeUser.email,
      });
    });

    it('should return null when user not found', async () => {
      vi.mocked(UserModel.findById).mockResolvedValue(undefined);

      const result = await service.getUser('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('getUserByAccount', () => {
    it('should return user when account exists', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              then: vi.fn((cb) =>
                Promise.resolve(
                  cb([
                    {
                      users: mockLobeUser,
                      account: { provider: 'google', providerAccountId: '123' },
                    },
                  ]),
                ),
              ),
            }),
          }),
        }),
      });

      mockDB.select = mockSelect;

      const result = await service.getUserByAccount({
        provider: 'google',
        providerAccountId: '123',
      });

      expect(result).toMatchObject({
        id: mockLobeUser.id,
        email: mockLobeUser.email,
      });
    });

    it('should return null when account not found', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              then: vi.fn((cb) => Promise.resolve(cb([]))),
            }),
          }),
        }),
      });

      mockDB.select = mockSelect;

      const result = await service.getUserByAccount({
        provider: 'google',
        providerAccountId: 'nonexistent',
      });

      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      const updatedData = { fullName: 'Updated Name' } as any;
      vi.mocked(UserModel.findById).mockResolvedValue(mockLobeUser);
      vi.mocked(UserModel.prototype.updateUser).mockResolvedValue(updatedData);

      const result = await service.updateUser({
        ...mockAdapterUser,
        name: 'Updated Name',
      });

      expect(UserModel.findById).toHaveBeenCalledWith(mockDB, mockAdapterUser.id);
      expect(result).toMatchObject({
        id: mockAdapterUser.id,
        name: 'Updated Name',
      });
    });

    it('should throw error when user not found', async () => {
      vi.mocked(UserModel.findById).mockResolvedValue(undefined);

      await expect(service.updateUser(mockAdapterUser)).rejects.toThrow('NextAuth: User not found');
    });

    it('should throw error when update fails', async () => {
      vi.mocked(UserModel.findById).mockResolvedValue(mockLobeUser);
      vi.mocked(UserModel.prototype.updateUser).mockResolvedValue(undefined as any);

      await expect(service.updateUser(mockAdapterUser)).rejects.toThrow(
        'NextAuth: Failed to update user',
      );
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      vi.mocked(UserModel.findById).mockResolvedValue(mockLobeUser);
      vi.mocked(UserModel.deleteUser).mockResolvedValue({} as any);

      await service.deleteUser('test-user-id');

      expect(UserModel.findById).toHaveBeenCalledWith(mockDB, 'test-user-id');
      expect(UserModel.deleteUser).toHaveBeenCalledWith(mockDB, 'test-user-id');
    });

    it('should throw error when user not found', async () => {
      vi.mocked(UserModel.findById).mockResolvedValue(undefined);

      await expect(service.deleteUser('nonexistent-id')).rejects.toThrow(
        'NextAuth: Delete User not found',
      );
    });
  });

  describe('createSession', () => {
    it('should create session successfully', async () => {
      const sessionData = {
        sessionToken: 'session-token-123',
        userId: 'test-user-id',
        expires: new Date('2025-01-01'),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn((cb) => Promise.resolve(cb([sessionData]))),
          }),
        }),
      });

      mockDB.insert = mockInsert;

      const result = await service.createSession(sessionData);

      expect(result).toMatchObject(sessionData);
    });
  });

  describe('getSessionAndUser', () => {
    it('should return session and user when session exists', async () => {
      const mockSession = {
        sessionToken: 'session-token-123',
        userId: 'test-user-id',
        expires: new Date('2025-01-01'),
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              then: vi.fn((cb) =>
                Promise.resolve(
                  cb([
                    {
                      session: mockSession,
                      user: mockLobeUser,
                    },
                  ]),
                ),
              ),
            }),
          }),
        }),
      });

      mockDB.select = mockSelect;

      const result = await service.getSessionAndUser('session-token-123');

      expect(result).toMatchObject({
        session: mockSession,
        user: expect.objectContaining({
          id: mockLobeUser.id,
        }),
      });
    });

    it('should return null when session not found', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              then: vi.fn((cb) => Promise.resolve(cb([]))),
            }),
          }),
        }),
      });

      mockDB.select = mockSelect;

      const result = await service.getSessionAndUser('nonexistent-token');

      expect(result).toBeNull();
    });
  });

  describe('updateSession', () => {
    it('should update session successfully', async () => {
      const sessionData = {
        sessionToken: 'session-token-123',
        expires: new Date('2025-01-01'),
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([sessionData]),
          }),
        }),
      });

      mockDB.update = mockUpdate;

      const result = await service.updateSession(sessionData);

      expect(result).toMatchObject(sessionData);
    });
  });

  describe('deleteSession', () => {
    it('should delete session successfully', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      mockDB.delete = mockDelete;

      await service.deleteSession('session-token-123');

      expect(mockDB.delete).toHaveBeenCalled();
    });
  });

  describe('linkAccount', () => {
    it('should link account successfully', async () => {
      const accountData: AdapterAccount = {
        userId: 'test-user-id',
        type: 'oauth' as const,
        provider: 'google',
        providerAccountId: '123',
        refresh_token: 'refresh-token',
        access_token: 'access-token',
        expires_at: 1234567890,
        token_type: 'bearer' as Lowercase<string>,
        scope: 'email profile',
        id_token: 'id-token',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([accountData]),
        }),
      });

      mockDB.insert = mockInsert;

      const result = await service.linkAccount(accountData);

      expect(result).toMatchObject(accountData);
    });

    it('should throw error when account creation fails', async () => {
      const accountData: AdapterAccount = {
        userId: 'test-user-id',
        type: 'oauth' as const,
        provider: 'google',
        providerAccountId: '123',
        refresh_token: 'refresh-token',
        access_token: 'access-token',
        expires_at: 1234567890,
        token_type: 'bearer' as Lowercase<string>,
        scope: 'email profile',
        id_token: 'id-token',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      mockDB.insert = mockInsert;

      await expect(service.linkAccount(accountData)).rejects.toThrow(
        'NextAuthAccountModel: Failed to create account',
      );
    });
  });

  describe('unlinkAccount', () => {
    it('should unlink account successfully', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      mockDB.delete = mockDelete;

      await service.unlinkAccount({
        provider: 'google',
        providerAccountId: '123',
      });

      expect(mockDB.delete).toHaveBeenCalled();
    });
  });

  describe('getAccount', () => {
    it('should return account when found', async () => {
      const mockAccount = {
        userId: 'test-user-id',
        type: 'oauth',
        provider: 'google',
        providerAccountId: '123',
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn((cb) => Promise.resolve(cb([mockAccount]))),
          }),
        }),
      });

      mockDB.select = mockSelect;

      const result = await service.getAccount('123', 'google');

      expect(result).toMatchObject(mockAccount);
    });

    it('should return null when account not found', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn((cb) => Promise.resolve(cb([]))),
          }),
        }),
      });

      mockDB.select = mockSelect;

      const result = await service.getAccount('nonexistent', 'google');

      expect(result).toBeNull();
    });
  });

  describe('createAuthenticator', () => {
    it('should create authenticator successfully', async () => {
      const authenticatorData = {
        credentialID: 'cred-123',
        userId: 'test-user-id',
        providerAccountId: 'provider-123',
        credentialPublicKey: 'public-key',
        counter: 0,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        transports: 'usb,nfc',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn((cb) => Promise.resolve(cb([authenticatorData]))),
          }),
        }),
      });

      mockDB.insert = mockInsert;

      const result = await service.createAuthenticator(authenticatorData);

      expect(result).toMatchObject(authenticatorData);
    });
  });

  describe('getAuthenticator', () => {
    it('should return authenticator when found', async () => {
      const mockAuthenticator = {
        credentialID: 'cred-123',
        userId: 'test-user-id',
        providerAccountId: 'provider-123',
        credentialPublicKey: 'public-key',
        counter: 0,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        transports: 'usb,nfc',
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn((cb) => Promise.resolve(cb([mockAuthenticator]))),
          }),
        }),
      });

      mockDB.select = mockSelect;

      const result = await service.getAuthenticator('cred-123');

      expect(result).toMatchObject({
        credentialID: mockAuthenticator.credentialID,
        transports: mockAuthenticator.transports,
      });
    });

    it('should throw error when authenticator not found', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn((cb) => Promise.resolve(cb([]))),
          }),
        }),
      });

      mockDB.select = mockSelect;

      await expect(service.getAuthenticator('nonexistent')).rejects.toThrow(
        'NextAuthUserService: Failed to get authenticator',
      );
    });
  });

  describe('listAuthenticatorsByUserId', () => {
    it('should return list of authenticators', async () => {
      const mockAuthenticators = [
        {
          credentialID: 'cred-123',
          userId: 'test-user-id',
          providerAccountId: 'provider-123',
          credentialPublicKey: 'public-key',
          counter: 0,
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
          transports: 'usb',
        },
        {
          credentialID: 'cred-456',
          userId: 'test-user-id',
          providerAccountId: 'provider-456',
          credentialPublicKey: 'public-key-2',
          counter: 5,
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
          transports: null,
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn((cb) => Promise.resolve(cb(mockAuthenticators))),
          }),
        }),
      });

      mockDB.select = mockSelect;

      const result = await service.listAuthenticatorsByUserId('test-user-id');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        credentialID: 'cred-123',
        transports: 'usb',
      });
      expect(result[1]).toMatchObject({
        credentialID: 'cred-456',
        transports: undefined,
      });
    });

    it('should throw error when no authenticators found', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn((cb) => Promise.resolve(cb([]))),
          }),
        }),
      });

      mockDB.select = mockSelect;

      await expect(service.listAuthenticatorsByUserId('test-user-id')).rejects.toThrow(
        'NextAuthUserService: Failed to get authenticator list',
      );
    });
  });

  describe('updateAuthenticatorCounter', () => {
    it('should update authenticator counter successfully', async () => {
      const mockAuthenticator = {
        credentialID: 'cred-123',
        userId: 'test-user-id',
        providerAccountId: 'provider-123',
        credentialPublicKey: 'public-key',
        counter: 10,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        transports: 'usb',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockReturnValue({
              then: vi.fn((cb) => Promise.resolve(cb([mockAuthenticator]))),
            }),
          }),
        }),
      });

      mockDB.update = mockUpdate;

      const result = await service.updateAuthenticatorCounter('cred-123', 10);

      expect(result).toMatchObject({
        credentialID: 'cred-123',
        counter: 10,
      });
    });

    it('should throw error when update fails', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockReturnValue({
              then: vi.fn((cb) => Promise.resolve(cb([]))),
            }),
          }),
        }),
      });

      mockDB.update = mockUpdate;

      await expect(service.updateAuthenticatorCounter('cred-123', 10)).rejects.toThrow(
        'NextAuthUserService: Failed to update authenticator counter',
      );
    });
  });

  describe('createVerificationToken', () => {
    it('should create verification token successfully', async () => {
      const tokenData = {
        identifier: 'test@example.com',
        token: 'verification-token-123',
        expires: new Date('2025-01-01'),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn((cb) => Promise.resolve(cb([tokenData]))),
          }),
        }),
      });

      mockDB.insert = mockInsert;

      const result = await service.createVerificationToken(tokenData);

      expect(result).toMatchObject(tokenData);
    });
  });

  describe('useVerificationToken', () => {
    it('should use and delete verification token successfully', async () => {
      const tokenData = {
        identifier: 'test@example.com',
        token: 'verification-token-123',
        expires: new Date('2025-01-01'),
      };

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn((cb) => Promise.resolve(cb([tokenData]))),
          }),
        }),
      });

      mockDB.delete = mockDelete;

      const result = await service.useVerificationToken({
        identifier: 'test@example.com',
        token: 'verification-token-123',
      });

      expect(result).toMatchObject(tokenData);
    });

    it('should return null when verification token not found', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn((cb) => Promise.resolve(cb([]))),
          }),
        }),
      });

      mockDB.delete = mockDelete;

      const result = await service.useVerificationToken({
        identifier: 'test@example.com',
        token: 'nonexistent-token',
      });

      expect(result).toBeNull();
    });
  });

  describe('safeUpdateUser', () => {
    it('should update user when found by account', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              then: vi.fn((cb) =>
                Promise.resolve(
                  cb([
                    {
                      users: mockLobeUser,
                      account: { provider: 'google', providerAccountId: '123' },
                    },
                  ]),
                ),
              ),
            }),
          }),
        }),
      });

      mockDB.select = mockSelect;
      vi.mocked(UserModel.prototype.updateUser).mockResolvedValue({
        avatar: 'new-avatar.jpg',
      } as any);

      const result = await service.safeUpdateUser(
        { provider: 'google', providerAccountId: '123' },
        { avatar: 'new-avatar.jpg', email: 'new@example.com' },
      );

      expect(pino.info).toHaveBeenCalledWith(expect.stringContaining('updating user'));
      expect(result.status).toBe(200);
    });

    it('should log warning when user not found by account', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              then: vi.fn((cb) => Promise.resolve(cb([]))),
            }),
          }),
        }),
      });

      mockDB.select = mockSelect;

      const result = await service.safeUpdateUser(
        { provider: 'google', providerAccountId: 'nonexistent' },
        { avatar: 'new-avatar.jpg' },
      );

      expect(pino.warn).toHaveBeenCalledWith(expect.stringContaining('no user was found'));
      expect(result.status).toBe(200);
    });
  });

  describe('safeSignOutUser', () => {
    it('should sign out user by deleting sessions when found', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              then: vi.fn((cb) =>
                Promise.resolve(
                  cb([
                    {
                      users: mockLobeUser,
                      account: { provider: 'google', providerAccountId: '123' },
                    },
                  ]),
                ),
              ),
            }),
          }),
        }),
      });

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      mockDB.select = mockSelect;
      mockDB.delete = mockDelete;

      const result = await service.safeSignOutUser({
        provider: 'google',
        providerAccountId: '123',
      });

      expect(pino.info).toHaveBeenCalledWith(expect.stringContaining('Signing out user'));
      expect(mockDB.delete).toHaveBeenCalled();
      expect(result.status).toBe(200);
    });

    it('should log warning when user not found for sign out', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              then: vi.fn((cb) => Promise.resolve(cb([]))),
            }),
          }),
        }),
      });

      mockDB.select = mockSelect;

      const result = await service.safeSignOutUser({
        provider: 'google',
        providerAccountId: 'nonexistent',
      });

      expect(pino.warn).toHaveBeenCalledWith(expect.stringContaining('no user was found'));
      expect(result.status).toBe(200);
    });
  });
});
