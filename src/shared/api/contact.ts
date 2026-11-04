import type { ContactInquiryCreateDto, ContactInquiryDto } from '../../types/api'
import { api } from './client'

export async function sendContactInquiry(body: ContactInquiryCreateDto): Promise<ContactInquiryDto> {
  const { data } = await api.post<ContactInquiryDto>('/contact', body)
  return data
}
