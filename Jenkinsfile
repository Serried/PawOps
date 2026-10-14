pipeline {
  agent { label 'node-docker' }

  options {
    disableConcurrentBuilds()
    timestamps()
    timeout(time: 20, unit: 'MINUTES')
  }

  parameters {
    booleanParam(
      name: 'PUBLISH_IMAGE',
      defaultValue: false,
      description: 'Publish the container image when building main'
    )
    string(
      name: 'IMAGE_NAME',
      defaultValue: 'docker.io/your-account/pawops',
      description: 'Registry image name, for example ghcr.io/your-org/pawops'
    )
  }

  environment {
    POSTGRES_DB = 'pawops_ci'
    POSTGRES_USER = 'pawops_ci'
    POSTGRES_PASSWORD = 'pawops_ci_password'
    DATABASE_URL = 'postgresql://pawops_ci:pawops_ci_password@localhost:5432/pawops_ci'
    API_PORT = '3001'
    COMPOSE_PROJECT_NAME = "pawops-${BUILD_NUMBER}"
  }

  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Quality') {
      parallel {
        stage('Lint') {
          steps {
            sh 'npm run lint'
          }
        }
        stage('Build web') {
          steps {
            sh 'npm run build'
          }
        }
      }
    }

    stage('Database integration') {
      steps {
        sh 'docker compose up -d --wait db'
        sh 'npm run db:migrate'
        sh 'TEST_DATABASE_URL="$DATABASE_URL" npm test'
        sh '''
          NODE_ENV=production npm start > api.log 2>&1 &
          echo $! > api.pid
          node -e "setTimeout(async () => { const response = await fetch('http://localhost:3001/api/health'); if (!response.ok) process.exit(1); console.log(await response.text()) }, 1500)"
        '''
      }
    }

    stage('Build image') {
      steps {
        sh 'docker build --tag ${IMAGE_NAME}:${BUILD_NUMBER} .'
      }
    }

    stage('Publish image') {
      when {
        allOf {
          branch 'main'
          expression { params.PUBLISH_IMAGE }
        }
      }
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'container-registry',
          usernameVariable: 'REGISTRY_USERNAME',
          passwordVariable: 'REGISTRY_PASSWORD'
        )]) {
          sh '''
            REGISTRY_HOST=$(echo "$IMAGE_NAME" | cut -d/ -f1)
            echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY_HOST" --username "$REGISTRY_USERNAME" --password-stdin
            docker tag "${IMAGE_NAME}:${BUILD_NUMBER}" "${IMAGE_NAME}:latest"
            docker push "${IMAGE_NAME}:${BUILD_NUMBER}"
            docker push "${IMAGE_NAME}:latest"
            docker logout "$REGISTRY_HOST"
          '''
        }
      }
    }
  }

  post {
    always {
      sh '''
        if [ -f api.pid ]; then kill $(cat api.pid) 2>/dev/null || true; fi
        docker compose down --volumes --remove-orphans || true
      '''
      archiveArtifacts artifacts: 'api.log', allowEmptyArchive: true
      deleteDir()
    }
  }
}

