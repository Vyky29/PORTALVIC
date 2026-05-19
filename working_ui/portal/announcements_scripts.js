  (function(){
    try{
      var q = new URLSearchParams(location.search).get('m');
      var st = sessionStorage.getItem('staffPortalMobileUx');
      var narrow = typeof matchMedia !== 'undefined' && matchMedia('(max-width:720px)').matches;
      var mobile = q === '1' || st === '1' || narrow;
      document.documentElement.setAttribute('data-portal-mobile', mobile ? '1' : '0');
    }catch(e){ document.documentElement.setAttribute('data-portal-mobile','1'); }
  })();
  