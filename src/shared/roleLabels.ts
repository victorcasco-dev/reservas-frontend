import type { Role, UserType } from '../types/api'

export function roleLabel(role: Role | UserType | string): string {
  switch (role) {
    case 'STUDENT':
      return 'Estudiante'
    case 'PROFESSOR':
      return 'Profesor'
    case 'ADMINISTRATOR':
      return 'Administrador'
    default:
      return role
  }
}

export function formatRoles(roles: string[]): string {
  return roles.map(roleLabel).join(' · ')
}
