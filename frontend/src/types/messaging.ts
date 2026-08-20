export interface Participant {
  id:        number
  full_name: string
  email:     string
  role?:     string
}

export interface MessageAttachment {
  id:        number
  file_name: string
  file_path: string
  mime_type: string
  file_size: number
}

export interface Message {
  id:               number
  conversation_id:  number
  sender_id:        number
  sender_name:      string
  body:             string
  is_draft:         boolean
  delivery_channel: 'system' | 'system_email'
  created_at:       string
  seen_at:          string | null
  attachments:      MessageAttachment[]
}

export interface Conversation {
  id:                       number
  subject:                  string | null
  type:                     'direct' | 'broadcast'
  created_by:               number
  updated_at:               string
  last_message_body:        string | null
  last_message_sender_name: string | null
  last_message_at:          string | null
  unread_count:             number
  participant_count:        number
}

export interface RecentUnread {
  conversation_id: number
  subject:         string | null
  sender_name:     string
  body:            string
  created_at:      string
}

export interface UnreadCountResponse {
  total:  number
  recent: RecentUnread[]
}

export interface RecipientOption {
  id:    number | string  // number = user id, string = role slug e.g. "all_students"
  label: string
  type:  'user' | 'role'
}

export interface CreateConversationPayload {
  recipients:  (number | string)[]
  subject?:    string
  body:         string
  send_email?:  boolean
  type?:        'direct' | 'broadcast'
}

export interface SendMessagePayload {
  body:        string
  send_email?: boolean
}
