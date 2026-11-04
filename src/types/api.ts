export type UserType = 'STUDENT' | 'PROFESSOR' | 'ADMINISTRATOR'

export type TimeSlotStatus = 'AVAILABLE' | 'BOOKED' | 'CANCELLED'

export type Role = UserType

export interface PageMetadata {
  page?: number
  size?: number
  totalElements?: number
  totalPages?: number
}

export interface UserDto {
  id: string
  email: string
  firstName: string
  lastName: string
  type: UserType
  active: boolean
  studentCode?: string | null
  academicTitle?: string | null
  position?: string | null
  tutorProfessorId?: string | null
}

export interface UserCreateDto {
  email: string
  password: string
  firstName: string
  lastName: string
  type: UserType
  studentCode?: string
  academicTitle?: string
  position?: string
  tutorProfessorId?: string
}

export interface UserUpdateDto {
  email: string
  firstName: string
  lastName: string
  password?: string
  studentCode?: string
  academicTitle?: string
  position?: string
  tutorProfessorId?: string
}

export interface UserPageDto {
  content: UserDto[]
  page?: PageMetadata
}

export interface TimeSlotDto {
  id: string
  professorId: string
  slotDate: string
  startTime: string
  endTime: string
  status: TimeSlotStatus
}

export interface TimeSlotCreateDto {
  professorId: string
  slotDate: string
  startTime: string
  endTime: string
}

export interface TimeSlotPageDto {
  content: TimeSlotDto[]
  page?: PageMetadata
}

export interface TokenResponse {
  accessToken: string
  tokenType: string
  expiresIn: number
  userId: string
  email: string
  roles: string[]
}

export interface CurrentUserResponse {
  userId: string
  email: string
  roles: string[]
}

export interface ApiError {
  status?: number
  code?: string
  message?: string
  path?: string
}

export interface PageResponseDto<T> {
  content: T[]
  page?: PageMetadata
}

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'

export interface CatalogDto {
  id: string
  name: string
  description?: string
  active: boolean
}

export interface ReservationDetailCreateDto {
  consultationTypeId: string
  comment?: string
}

export interface ReservationDetailDto {
  id: string
  consultationType: CatalogDto
  comment?: string
}

export interface ReservationCreateDto {
  studentId: string
  timeSlotId: string
  details: ReservationDetailCreateDto[]
}

export interface ReservationDto {
  id: string
  studentId: string
  timeSlot: TimeSlotDto
  status: ReservationStatus
  details: ReservationDetailDto[]
}

export type NotificationType =
  | 'RESERVATION_CONFIRMED'
  | 'RESERVATION_CANCELLED'
  | 'CONTACT_RECEIVED'
  | 'GENERIC'

export type NotificationChannel = 'EMAIL'
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED'

export interface NotificationDto {
  id: string
  userId: string
  type: NotificationType
  channel: NotificationChannel
  status: NotificationStatus
  payload?: Record<string, unknown>
  sentAt?: string
  errorMessage?: string
}

export interface ContactInquiryCreateDto {
  name: string
  email: string
  message: string
}

export interface ContactInquiryDto {
  id: string
  name: string
  email: string
  message: string
}
