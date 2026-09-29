$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    docker compose stop payment-service
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not stop payment-service. Check that Docker Desktop and Compose are running.'
    }

    $eventId = [guid]::NewGuid().ToString()
    $payload = @{
        type = 'payment.success'
        eventId = $eventId
        paymentId = $eventId
        orderId = "queue-demo-$eventId"
        status = 'succeeded'
    } | ConvertTo-Json -Compress

    $requestBody = @{
        properties = @{}
        routing_key = 'payment.success'
        payload = $payload
        payload_encoding = 'string'
    } | ConvertTo-Json -Compress

    $credential = [System.Management.Automation.PSCredential]::new(
        'guest',
        (ConvertTo-SecureString 'guest' -AsPlainText -Force)
    )

    $queueUri = 'http://localhost:15672/api/queues/%2F/payment.success.queue'
    $publishUri = 'http://localhost:15672/api/exchanges/%2F/shop.events/publish'
    $queue = $null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $queue = Invoke-RestMethod -Uri $queueUri -Credential $credential
        if ($queue.consumers -eq 0) {
            break
        }
        Start-Sleep -Milliseconds 250
    }

    if ($queue.consumers -ne 0) {
        throw 'Payment stopped, but RabbitMQ still reports an active queue consumer.'
    }

    $publishedNewEvent = $false
    if ($queue.messages_ready -eq 0) {
        $publishResult = Invoke-RestMethod `
            -Uri $publishUri `
            -Method Post `
            -Credential $credential `
            -ContentType 'application/json' `
            -Body $requestBody

        if (-not $publishResult.routed) {
            throw 'RabbitMQ did not route the test event to a queue.'
        }
        $publishedNewEvent = $true
    }

    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $queue = Invoke-RestMethod -Uri $queueUri -Credential $credential
        if ($queue.consumers -eq 0 -and $queue.messages_ready -ge 1) {
            break
        }
        Start-Sleep -Milliseconds 250
    }

    if ($queue.consumers -ne 0 -or $queue.messages_ready -lt 1) {
        throw 'Payment is stopped, but the test message is not visible in payment.success.queue.'
    }

    if ($publishedNewEvent) {
        Write-Output "Payment service is stopped. Published queue demo event: queue-demo-$eventId."
    } else {
        Write-Output 'Payment service is stopped. An existing event is still queued.'
    }
    $queue | Select-Object name, consumers, messages_ready, messages_unacknowledged | Format-List
    Write-Output 'Start payment-service again to consume the queued event.'
} finally {
    Pop-Location
}