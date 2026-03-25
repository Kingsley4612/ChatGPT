import { getCurrentUser, mockSecurityConfig } from '../../services/security.service';

export function useSecurity() {
  return {
    user: getCurrentUser(),
    security: mockSecurityConfig,
  };
}
