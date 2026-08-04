pipeline {

    agent any

    stages {

        stage('Checkout Source Code') {
            steps {
                checkout scm
            }
        }

        stage('Verify Build Environment') {
            steps {
                sh 'hugo version'
            }
        }

        stage('Build Static Website') {
            steps {
                sh '''
                podman run \
                    --rm \
                    --name "hugo-build-${BUILD_NUMBER}" \
                    --pull=missing \
                    -u "$(id -u):$(id -g)" \
                    -e HUGO_CACHEDIR=/tmp \
                    -v "$WORKSPACE:/src" \
                    -w /src \
                    klakegg/hugo:ext-alpine \
                    hugo \
                    --minify \
                    --destination public
                '''
            }
        }

    }

}
