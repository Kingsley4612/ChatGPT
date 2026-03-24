import { mockSecurityConfig, mockUserContext } from '../../services/security.service';

export function useSecurity() {
  return {
    user: mockUserContext,
    security: mockSecurityConfig,
  };
}
