-- iPhone voice notes arrive as video/mp4 or audio/x-m4a. The bucket was refusing them,
-- so the interview showed No recording and the file never reached the club.

update storage.buckets
set allowed_mime_types = array[
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/x-m4a',
  'audio/m4a',
  'audio/3gpp',
  'video/mp4',
  'video/quicktime'
]::text[]
where id = 'interview-audio';
