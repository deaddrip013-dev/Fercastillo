
$ErrorActionPreference = "Stop"

$apiBase = (Read-Host "URL de tu Worker de FerCastillo (ej. https://fercastillo-api.<tu-subdominio>.workers.dev)").TrimEnd('/')
$origin = Read-Host "URL publica exacta de tu tienda FerCastillo (origen, sin ruta)"
$api = "$apiBase/api/auth/setup"

Write-Host "`n=== FerCastillo 2.0 ===" -ForegroundColor Cyan
Write-Host "Registro del administrador inicial`n"

$email = Read-Host "Correo del administrador"
$name = Read-Host "Nombre del administrador"

$secureToken = Read-Host "ADMIN_SETUP_TOKEN" -AsSecureString
$securePassword = Read-Host "Nueva contrasena (minimo 12 caracteres)" -AsSecureString

function ConvertTo-PlainText($secureValue) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)

    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

try {
    $token = ConvertTo-PlainText $secureToken
    $password = ConvertTo-PlainText $securePassword

    $body = @{
        email = $email
        displayName = $name
        password = $password
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
        -Uri $api `
        -Method POST `
        -Headers @{
            Authorization = "Bearer $token"
            Origin = $origin
        } `
        -ContentType "application/json" `
        -Body $body

    Write-Host "`nADMINISTRADOR CREADO" -ForegroundColor Green
    $response | Format-List
}
catch {
    Write-Host "`nERROR AL CREAR ADMINISTRADOR" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
    else {
        Write-Host $_.Exception.Message
    }
}
finally {
    $token = $null
    $password = $null
    $body = $null

    $secureToken.Dispose()
    $securePassword.Dispose()
}
