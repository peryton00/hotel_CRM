param(
    [Parameter(Mandatory)][string]$DbUser,
    [ValidatePattern('^[a-z][a-z0-9_]{0,62}$')][string]$DbName = 'hotel_crm_local',
    [ValidateRange(1,65535)][int]$DbPort = 5432
)
$ErrorActionPreference = 'Stop'
# Use a preconfigured local role with CREATEDB and a PostgreSQL password file or prompt.
$connection = @('--host=127.0.0.1', "--port=$DbPort", "--username=$DbUser")
$exists = & psql @connection --dbname=postgres -XAt --set=ON_ERROR_STOP=1 --command="SELECT 1 FROM pg_database WHERE datname='$DbName'"
if ($LASTEXITCODE) { throw 'Could not check local PostgreSQL databases.' }
if ($exists -ne '1') {
    & createdb @connection --encoding=UTF8 --template=template0 -- $DbName
    if ($LASTEXITCODE) { throw 'Could not create the local database.' }
}
Write-Host "Database $DbName is ready. Set LOCAL_DATABASE_URL privately and run pos-setup.exe --init-admin to provision a new till."
