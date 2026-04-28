alter table public.clients
  add column if not exists logo_url text;

do $$
declare
  item jsonb;
begin
  for item in
    select * from jsonb_array_elements('[
      {"name":"ESPETO DO XANDY","logo_url":"https://ui-avatars.com/api/?name=Espeto+do+Xandy&background=fef2f2&color=991b1b&size=128"},
      {"name":"JJ VEICULOS","logo_url":"https://ui-avatars.com/api/?name=JJ+Veiculos&background=eff6ff&color=1d4ed8&size=128"},
      {"name":"GIRO VEICULOS","logo_url":"https://ui-avatars.com/api/?name=Giro+Veiculos&background=ecfeff&color=155e75&size=128"},
      {"name":"BRASEIRO BOM SABOR","logo_url":"https://ui-avatars.com/api/?name=Braseiro+Bom+Sabor&background=fff7ed&color=c2410c&size=128"},
      {"name":"ATACAREJO ITZ","logo_url":"https://ui-avatars.com/api/?name=Atacarejo+Itz&background=f0fdf4&color=166534&size=128"},
      {"name":"KS BOUTIQUE","logo_url":"https://ui-avatars.com/api/?name=KS+Boutique&background=fdf2f8&color=9d174d&size=128"},
      {"name":"RANCHO DO OLEIRO","logo_url":"https://ui-avatars.com/api/?name=Rancho+do+Oleiro&background=fefce8&color=854d0e&size=128"},
      {"name":"CDN MAGAZINE","logo_url":"https://ui-avatars.com/api/?name=CDN+Magazine&background=f8fafc&color=334155&size=128"},
      {"name":"PRATOS PIZZARIA","logo_url":"https://ui-avatars.com/api/?name=Pratos+Pizzaria&background=f0fdf4&color=166534&size=128"},
      {"name":"DR LUDMYLA","logo_url":"https://ui-avatars.com/api/?name=Dr+Ludmyla&background=fdf2f8&color=9d174d&size=128"},
      {"name":"LUCENA MENSWEAR","logo_url":"https://ui-avatars.com/api/?name=Lucena+Menswear&background=f8fafc&color=111827&size=128"},
      {"name":"GERSON CHEVROLET","logo_url":"https://ui-avatars.com/api/?name=Gerson+Chevrolet&background=eff6ff&color=1d4ed8&size=128"},
      {"name":"MOTO GARAGEM","logo_url":"https://ui-avatars.com/api/?name=Moto+Garagem&background=fefce8&color=a16207&size=128"},
      {"name":"GR PHONE","logo_url":"https://ui-avatars.com/api/?name=GR+Phone&background=eff6ff&color=1d4ed8&size=128"},
      {"name":"FABIO VEICULOS","logo_url":"https://ui-avatars.com/api/?name=Fabio+Veiculos&background=fff7ed&color=c2410c&size=128"},
      {"name":"VIP CAR","logo_url":"https://ui-avatars.com/api/?name=VIP+Car&background=f8fafc&color=111827&size=128"},
      {"name":"DIVAS FASHION","logo_url":"https://ui-avatars.com/api/?name=Divas+Fashion&background=fdf4ff&color=86198f&size=128"},
      {"name":"BRANDAO VEICULOS","logo_url":"https://ui-avatars.com/api/?name=Brandao+Veiculos&background=eef2ff&color=4338ca&size=128"},
      {"name":"MB FASHION","logo_url":"https://ui-avatars.com/api/?name=MB+Fashion&background=f8fafc&color=1f2937&size=128"},
      {"name":"CM CLOSET","logo_url":"https://ui-avatars.com/api/?name=CM+Closet&background=fdf2f8&color=9d174d&size=128"},
      {"name":"DONNAS COXINHA","logo_url":"https://ui-avatars.com/api/?name=Donnas+Coxinha&background=fef2f2&color=b91c1c&size=128"},
      {"name":"WALLYSON MOTOCA","logo_url":"https://ui-avatars.com/api/?name=Wallyson+Motoca&background=eff6ff&color=1d4ed8&size=128"},
      {"name":"PILARES DO DIREITO","logo_url":"https://ui-avatars.com/api/?name=Pilares+do+Direito&background=eef2ff&color=3730a3&size=128"},
      {"name":"REALIZE MOTORS","logo_url":"https://ui-avatars.com/api/?name=Realize+Motors&background=f8fafc&color=111827&size=128"},
      {"name":"STYLUS VITTA","logo_url":"https://ui-avatars.com/api/?name=Stylus+Vitta&background=fefce8&color=a16207&size=128"},
      {"name":"LEANDRO DESPACHANTE","logo_url":"https://ui-avatars.com/api/?name=Leandro+Despachante&background=f8fafc&color=334155&size=128"},
      {"name":"JH IMPORTS","logo_url":"https://ui-avatars.com/api/?name=JH+Imports&background=f8fafc&color=334155&size=128"}
    ]'::jsonb)
  loop
    insert into public.clients (name, status, logo_url)
    select
      item->>'name',
      'active',
      item->>'logo_url'
    where not exists (
      select 1
      from public.clients
      where lower(name) = lower(item->>'name')
    );
  end loop;
end $$;
