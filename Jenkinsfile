pipeline {
  agent { label 'node-docker' }

  parameters {
    string(
      name: 'GIT_SHA',
      defaultValue: '',
      description: 'Exact Git commit SHA to verify'
    )

    string(
      name: 'GIT_REF',
      defaultValue: '',
      description: 'Source branch/ref'
    )

    string(
      name: 'PR_NUMBER',
      defaultValue: '',
      description: 'GitHub Pull Request number'
    )
  }

  options {
    skipDefaultCheckout(true)
    disableConcurrentBuilds()
    timestamps()
    timeout(time: 20, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    CI = 'true'

    POSTGRES_DB = 'pawops_ci'
    POSTGRES_USER = 'pawops_ci'

    // Let Docker select an unused host port.
    POSTGRES_PORT = '0'

    COMPOSE_PROJECT_NAME = "pawops-ci-${BUILD_NUMBER}-${EXECUTOR_NUMBER}"

    REPOSITORY_URL = 'https://github.com/Serried/PawOps'
  }

  stages {

    stage('Validate Parameters') {
      steps {
        script {
          if (!params.GIT_SHA?.trim()) {
            error('GIT_SHA is required.')
          }

          if (!(params.GIT_SHA ==~ /^[0-9a-fA-F]{40}$/)) {
            error("Invalid GIT_SHA: ${params.GIT_SHA}")
          }
        }

        echo "Requested commit: ${params.GIT_SHA}"
        echo "Requested ref: ${params.GIT_REF ?: 'N/A'}"
        echo "Pull Request: ${params.PR_NUMBER ?: 'N/A'}"
      }
    }


    stage('Checkout') {
      steps {
        deleteDir()

        checkout([
          $class: 'GitSCM',

          branches: [[
            name: params.GIT_SHA
          ]],

          userRemoteConfigs: [[
            url: env.REPOSITORY_URL
          ]],

          extensions: [
            [
              $class: 'CloneOption',
              noTags: true,
              shallow: false,
              timeout: 10
            ]
          ]
        ])

        script {
          env.CI_COMMIT = powershell(
            script: '(git rev-parse HEAD).Trim()',
            returnStdout: true
          ).trim()

          if (!env.CI_COMMIT.equalsIgnoreCase(params.GIT_SHA)) {
            error(
              "Checkout mismatch. Expected ${params.GIT_SHA}, " +
              "but Jenkins checked out ${env.CI_COMMIT}"
            )
          }

          def revision = env.CI_COMMIT.take(12)
          def sourceRef = params.GIT_REF?.trim()
            ? params.GIT_REF
            : 'unknown-ref'

          def pr = params.PR_NUMBER?.trim()
            ? "PR #${params.PR_NUMBER}"
            : 'No PR'

          currentBuild.displayName =
            "#${env.BUILD_NUMBER} ${revision}"

          currentBuild.description =
            "${pr} | ${sourceRef} @ ${revision}"
        }

        powershell '''
          $ErrorActionPreference = "Stop"

          Write-Host "Checked out revision:"
          git rev-parse HEAD

          Write-Host ""
          Write-Host "Git status:"
          git status --short --branch
        '''

        echo "Verified exact commit: ${env.CI_COMMIT}"
      }
    }


    stage('Environment Validation') {
      steps {
        powershell '''
          $ErrorActionPreference = "Stop"

          Write-Host "=== Java ==="
          java -version

          Write-Host ""
          Write-Host "=== Git ==="
          git --version

          Write-Host ""
          Write-Host "=== Node ==="
          node --version

          Write-Host ""
          Write-Host "=== npm ==="
          npm --version

          Write-Host ""
          Write-Host "=== Docker ==="
          docker --version

          Write-Host ""
          Write-Host "=== Docker Compose ==="
          docker compose version

          Write-Host ""
          Write-Host "=== Docker Engine ==="
          docker info --format 'Docker server {{.ServerVersion}}'

          $nodeMajor = [int](
            node -p "process.versions.node.split('.')[0]"
          )

          if ($nodeMajor -lt 22) {
            throw "Node.js 22 or newer is required. Found major version $nodeMajor."
          }

          $requiredFiles = @(
            "package-lock.json",
            "Dockerfile",
            "docker-compose.yml"
          )

          foreach ($file in $requiredFiles) {
            if (!(Test-Path $file)) {
              throw "Required file not found: $file"
            }
          }

          Write-Host ""
          Write-Host "Environment validation passed."
        '''
      }
    }


    stage('Install Dependencies') {
      steps {
        powershell '''
          $ErrorActionPreference = "Stop"

          npm ci --no-audit --no-fund

          if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed."
          }
        '''
      }
    }


    stage('Lint / Static Checks') {
      steps {
        powershell '''
          $ErrorActionPreference = "Stop"

          npm run lint

          if ($LASTEXITCODE -ne 0) {
            throw "Lint/static checks failed."
          }
        '''
      }
    }


    stage('Automated Tests') {
      steps {
        powershell '''
          $ErrorActionPreference = "Stop"

          npm run test:ci

          if ($LASTEXITCODE -ne 0) {
            throw "Automated tests failed."
          }
        '''
      }
    }


    stage('Application Build') {
      steps {
        powershell '''
          $ErrorActionPreference = "Stop"

          npm run build

          if ($LASTEXITCODE -ne 0) {
            throw "Application build failed."
          }
        '''
      }
    }


    stage('Docker Build Verification') {
      steps {
        powershell '''
          $ErrorActionPreference = "Stop"

          $imageTag = "pawops-ci:$env:CI_COMMIT"

          Write-Host "Building image $imageTag"

          docker build --tag $imageTag .

          if ($LASTEXITCODE -ne 0) {
            throw "Docker image build failed."
          }

          Set-Content `
            -Path ".ci-image-tag" `
            -Value $imageTag `
            -NoNewline

          Write-Host "Docker image verification passed: $imageTag"
        '''
      }
    }


    stage('Deploy Staging & Smoke Test') {
      steps {
        powershell '''
          $ErrorActionPreference = "Stop"

          # This isolated Compose project is the CI staging deployment. Declarative
          # stage ordering guarantees it is never reached after a failed test/build.
          $env:POSTGRES_PASSWORD = [guid]::NewGuid().ToString("N")
          $env:RABBITMQ_PASSWORD = [guid]::NewGuid().ToString("N")
          $env:POSTGRES_PORT = "0"
          $env:WEB_PORT = "0"

          docker compose up --build --detach --wait

          if ($LASTEXITCODE -ne 0) {
            throw "Staging deployment failed to become healthy."
          }

          $portLine = docker compose port app 3001
          $appPort = ($portLine -split ':')[-1].Trim()
          if (!($appPort -match '^\d+$')) {
            throw "Compose did not return a valid application port: $portLine"
          }

          $health = Invoke-RestMethod `
            -Uri "http://127.0.0.1:$appPort/api/health" `
            -Method Get `
            -TimeoutSec 15

          if ($health.status -ne "ok" -or $health.database -ne "connected") {
            throw "Health smoke test returned an unhealthy response."
          }

          $home = Invoke-WebRequest `
            -Uri "http://127.0.0.1:$appPort/" `
            -Method Get `
            -TimeoutSec 15 `
            -UseBasicParsing

          if ($home.StatusCode -ne 200 -or $home.Content -notmatch '<div id="root">') {
            throw "Frontend smoke test failed."
          }

          Write-Host "Staging deploy and smoke tests passed on port $appPort."
        '''
      }
    }
  }


  post {

    success {
      echo """
CI PASSED

Commit:
${env.CI_COMMIT}

This revision completed:
- environment validation
- dependency installation
- lint/static checks
- automated tests
- application build
- Docker image build
- isolated staging deployment
- API health and frontend smoke tests

GitHub Actions may treat this Jenkins build as successful.
"""
    }


    failure {
      echo """
CI FAILED

One or more required verification stages failed.

GitHub Actions must treat this Jenkins build as failed
and the Pull Request must not satisfy the merge gate.
"""
    }


    unstable {
      echo """
CI UNSTABLE

This build must not be treated as a successful merge gate.
"""
    }


    aborted {
      echo """
CI ABORTED

This build must not be treated as a successful merge gate.
"""
    }


    unsuccessful {
      echo 'CI verification was unsuccessful.'
    }


    always {
      script {

        if (fileExists('docker-compose.yml')) {
          powershell(
            returnStatus: true,
            script: '''
              Write-Host "Cleaning Docker Compose resources..."

              docker compose down `
                --volumes `
                --remove-orphans
            '''
          )
        }


        if (fileExists('.ci-image-tag')) {
          powershell(
            returnStatus: true,
            script: '''
              $imageTag = Get-Content ".ci-image-tag"

              if ($imageTag) {
                Write-Host "Removing CI image $imageTag"

                docker image rm $imageTag
              }
            '''
          )
        }
      }

      deleteDir()
    }
  }
}
