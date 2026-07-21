
select document_type, category, count(*) 
from public.documents 
where lower(coalesce(category,'')) in ('training','certificates','certificate','firstaid','first_aid','safeguarding')
   or lower(coalesce(document_type,'')) similar to '%(cert|train|induct|first.?aid|safeguard|diploma|ld_funding)%'
group by 1,2 order by 3 desc limit 40;

