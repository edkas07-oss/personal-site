pipeline {

    /**************************************************************************
     * Build Agent
     *
     * Seluruh proses CI dijalankan pada Jenkins SSH agent dengan label
     * "builder" dan menggunakan rootless Podman.
     **************************************************************************/

    agent {
        label 'builder'
    }

    /**************************************************************************
     * Shared Configuration
     *
     * Konfigurasi non-secret CI dan CD dikelola pada deployment/CONFIG.
     * Credential tetap dikelola menggunakan Jenkins Credentials.
     **************************************************************************/

    stages {

        /**********************************************************************
         * Checkout Source Code
         **********************************************************************/

        stage('Checkout Source Code') {
            steps {
                checkout scm
            }
        }

        /**********************************************************************
         * Verify Build Agent
         **********************************************************************/

        stage('Verify Build Agent') {
            steps {
                sh '''
                    set -eu

                    . deployment/CONFIG

                    echo "========================================"
                    echo "VERIFY BUILD AGENT"
                    echo "========================================"
                    echo "Hostname : $(hostname)"
                    echo "User     : $(whoami)"
                    echo "Home     : $HOME"
                    echo "Workspace: $WORKSPACE"

                    test "$(podman info --format '{{.Host.Security.Rootless}}')" = 'true'
                '''
            }
        }

        /**********************************************************************
         * Build Static Website
         *
         * Hugo dijalankan sebagai ephemeral container. Workspace Jenkins
         * dipasang sebagai source directory dan menghasilkan public/.
         **********************************************************************/

        stage('Build Static Website') {
            steps {
                sh '''
                    set -eu

                    . deployment/CONFIG

                    podman run \
                        --userns=keep-id \
                        --rm \
                        --pull=missing \
                        --volume "$WORKSPACE:/src:Z" \
                        --workdir /src \
                        "$HUGO_IMAGE" \
                        --minify --destination public
                '''
            }
        }

        /**********************************************************************
         * Package Artifact
         *
         * Static website dikemas menggunakan nama yang dapat ditelusuri ke
         * nomor build Jenkins.
         **********************************************************************/

        stage('Package Artifact') {
            steps {
                sh '''
                    set -eu

                    . deployment/CONFIG
                    ARTIFACT_NAME="${ARTIFACT_PREFIX}-${BUILD_NUMBER}.tar.gz"

                    rm -f "${ARTIFACT_PREFIX}-"*.tar.gz
                    tar czf "$ARTIFACT_NAME" public

                    echo
                    echo "========================================"
                    echo "Artifact"
                    echo "========================================"
                    ls -lh "$ARTIFACT_NAME"
                '''
            }
        }

        /**********************************************************************
         * Publish Artifact
         *
         * Artifact diunggah ke MinIO menggunakan ephemeral MinIO Client.
         * Credential hanya tersedia selama stage ini.
         **********************************************************************/

        stage('Publish Artifact') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'minio-root',
                        usernameVariable: 'MINIO_USER',
                        passwordVariable: 'MINIO_PASSWORD'
                    )
                ]) {
                    sh '''
                        set -eu

                        . deployment/CONFIG
                        ARTIFACT_NAME="${ARTIFACT_PREFIX}-${BUILD_NUMBER}.tar.gz"

                        podman run \
                            --rm \
                            --volume "$WORKSPACE:/workspace:Z" \
                            --workdir /workspace \
                            --env ARTIFACT_NAME \
                            --env MINIO_ALIAS \
                            --env MINIO_BUCKET \
                            --env MINIO_URL \
                            --env MINIO_USER \
                            --env MINIO_PASSWORD \
                            --entrypoint /bin/sh \
                            "$MC_IMAGE" \
                            -ec '
                                mc alias set "$MINIO_ALIAS" "$MINIO_URL" "$MINIO_USER" "$MINIO_PASSWORD"
                                mc mb --ignore-existing "$MINIO_ALIAS/$MINIO_BUCKET"
                                mc cp "$ARTIFACT_NAME" "$MINIO_ALIAS/$MINIO_BUCKET/$ARTIFACT_NAME"
                                mc ls "$MINIO_ALIAS/$MINIO_BUCKET/$ARTIFACT_NAME"
                            '
                    '''
                }
            }
        }
    }

    /**************************************************************************
     * Post Actions
     **************************************************************************/

    post {
        always {
            archiveArtifacts artifacts: '*.tar.gz'
        }
    }
}
