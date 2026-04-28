# Supabase Edge Functions Deployment Script
# Instala Scoop, Supabase CLI e faz deploy das 4 functions

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Supabase Edge Functions Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verificar se Scoop esta instalado
Write-Host "[1/4] Verificando Scoop..." -ForegroundColor Yellow
$scoopInstalled = Get-Command scoop -ErrorAction SilentlyContinue
if ($null -eq $scoopInstalled) {
    Write-Host "Scoop nao encontrado. Instalando..." -ForegroundColor Yellow
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    
    # Download e instala Scoop
    iwr -useb get.scoop.sh | iex
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK - Scoop instalado" -ForegroundColor Green
    }
    else {
        Write-Host "ERRO ao instalar Scoop" -ForegroundColor Red
        exit 1
    }
}
else {
    Write-Host "OK - Scoop ja instalado" -ForegroundColor Green
}

Write-Host ""
Write-Host "[2/4] Instalando Supabase CLI..." -ForegroundColor Yellow

scoop install supabase

if ($LASTEXITCODE -eq 0) {
    Write-Host "OK - Supabase CLI instalado" -ForegroundColor Green
}
else {
    Write-Host "ERRO ao instalar Supabase CLI" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[3/4] Fazendo login no Supabase..." -ForegroundColor Yellow
Write-Host "Uma janela do navegador sera aberta. Faca login com sua conta." -ForegroundColor Cyan

supabase login

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO ao fazer login" -ForegroundColor Red
    exit 1
}

Write-Host "OK - Login realizado" -ForegroundColor Green

Write-Host ""
Write-Host "[4/4] Fazendo deploy das 4 Edge Functions..." -ForegroundColor Yellow

$projectId = "npfcxgijwrxrssinpkdw"
$deployedCount = 0

# Deploy analyze-creatives
Write-Host "  Deploying analyze-creatives..." -ForegroundColor Cyan
supabase functions deploy analyze-creatives --project-id $projectId
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK - analyze-creatives deployed" -ForegroundColor Green
    $deployedCount++
}
else {
    Write-Host "  ERRO - analyze-creatives" -ForegroundColor Red
}

# Deploy generate-copy
Write-Host "  Deploying generate-copy..." -ForegroundColor Cyan
supabase functions deploy generate-copy --project-id $projectId
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK - generate-copy deployed" -ForegroundColor Green
    $deployedCount++
}
else {
    Write-Host "  ERRO - generate-copy" -ForegroundColor Red
}

# Deploy summarize-period
Write-Host "  Deploying summarize-period..." -ForegroundColor Cyan
supabase functions deploy summarize-period --project-id $projectId
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK - summarize-period deployed" -ForegroundColor Green
    $deployedCount++
}
else {
    Write-Host "  ERRO - summarize-period" -ForegroundColor Red
}

# Deploy prioritize-audit
Write-Host "  Deploying prioritize-audit..." -ForegroundColor Cyan
supabase functions deploy prioritize-audit --project-id $projectId
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK - prioritize-audit deployed" -ForegroundColor Green
    $deployedCount++
}
else {
    Write-Host "  ERRO - prioritize-audit" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploy Concluido!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Functions deployed: $deployedCount/4" -ForegroundColor Cyan
Write-Host ""

if ($deployedCount -eq 4) {
    Write-Host "SUCESSO - Todas as 4 Edge Functions foram deployed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximos passos:" -ForegroundColor Yellow
    Write-Host "1. Dashboard: https://app.supabase.com/project/$projectId/functions" -ForegroundColor White
    Write-Host "2. Adicione ANTHROPIC_API_KEY no Supabase Secrets" -ForegroundColor White
    Write-Host "3. Teste as functions" -ForegroundColor White
}
else {
    Write-Host "ATENCAO - Apenas $deployedCount/4 functions foram deployed" -ForegroundColor Yellow
}

Write-Host ""

