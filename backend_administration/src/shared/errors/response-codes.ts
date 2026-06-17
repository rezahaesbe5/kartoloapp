// Sumber tunggal mapping rc ↔ HTTP status ↔ default message.
// Identik dengan backend_gatewayauth supaya envelope konsisten di seluruh ekosistem.

export type ErrorType =
  | 'approved'
  | 'expired'
  | 'not_found'
  | 'too_many_request'
  | 'in_process'
  | 'insufficient_fund'
  | 'already_paid'
  | 'db_error'
  | 'token_invalid'
  | 'header_unauthorized'
  | 'signature_invalid'
  | 'body_invalid'
  | 'app_close'
  | 'other';

export interface ResponseCodeMeta {
  rc: string;
  status: number;
  defaultMessage: string;
}

export const RESPONSE_CODES: Record<ErrorType, ResponseCodeMeta> = {
  approved:           { rc: '00', status: 200, defaultMessage: 'Berhasil' },
  expired:            { rc: '12', status: 400, defaultMessage: 'Resource sudah expired' },
  not_found:          { rc: '14', status: 400, defaultMessage: 'Resource tidak ditemukan' },
  too_many_request:   { rc: '60', status: 429, defaultMessage: 'Terlalu banyak permintaan, coba lagi nanti' },
  in_process:         { rc: '68', status: 400, defaultMessage: 'Permintaan masih diproses' },
  insufficient_fund:  { rc: '81', status: 400, defaultMessage: 'Saldo tidak cukup' },
  already_paid:       { rc: '88', status: 400, defaultMessage: 'Transaksi sudah diproses sebelumnya' },
  db_error:           { rc: '90', status: 400, defaultMessage: 'Terjadi kesalahan pada database' },
  token_invalid:      { rc: '91', status: 400, defaultMessage: 'Token tidak valid atau sudah expired' },
  header_unauthorized:{ rc: '92', status: 400, defaultMessage: 'Header autentikasi tidak lengkap atau salah' },
  signature_invalid:  { rc: '93', status: 400, defaultMessage: 'Signature request tidak valid' },
  body_invalid:       { rc: '94', status: 400, defaultMessage: 'Data permintaan tidak valid' },
  app_close:          { rc: '95', status: 400, defaultMessage: 'Layanan sementara tidak tersedia' },
  other:              { rc: '99', status: 400, defaultMessage: 'Terjadi kesalahan tidak terduga' },
};
