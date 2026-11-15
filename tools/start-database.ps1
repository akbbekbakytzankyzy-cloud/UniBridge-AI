$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repo
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is missing. Install Docker Desktop with the WSL 2 backend, restart if requested, then rerun this script. For a local preview without Docker, use npm run dev:local.'
}
docker info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and wait for the Linux engine to become ready.' }
if (-not (Test-Path -LiteralPath '.env')) {
  $secret = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLowerInvariant()
  @("DATABASE_URL=postgres://unibridge:${secret}@localhost:5432/unibridge", "POSTGRES_PASSWORD=$secret", 'PORT=3001', 'APP_ORIGIN=http://localhost:5173', 'NODE_ENV=development') | Set-Content -LiteralPath '.env'
}
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Database startup failed.' }
npm.cmd run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
Write-Host 'PostgreSQL + pgvector is ready. Provision accounts with npm run user:create, then run npm run dev.'
