pipeline {

    /**************************************************************************
     * Menentukan Build Agent
     *
     * Seluruh proses build dijalankan pada Jenkins SSH Build Agent
     * dengan label "builder".
     **************************************************************************/

    agent {
        label 'builder'
    }

    /**************************************************************************
     * Environment Variables
     **************************************************************************/

    environment {

        HUGO_IMAGE   = 'docker.io/klakegg/hugo:ext-alpine'
        MC_IMAGE     = 'quay.io/minio/mc:latest'

        ARTIFACT_NAME = "personal-site-${BUILD_NUMBER}.tar.gz"

        MINIO_ALIAS  = 'artifact-storage'
        MINIO_BUCKET = 'personal-site'

        MINIO_URL = 'http://host.containers.internal:9000'

    }

    stages {

        /**********************************************************************
         * Checkout Source Code
         *
         * Jenkins melakukan checkout source code ke Workspace
         * pada Build Agent.
         **********************************************************************/

        stage('Checkout Source Code') {

            steps {

                checkout scm

            }

        }

        /**********************************************************************
         * Verify Build Agent
         *
         * Memastikan Build Agent siap digunakan.
         **********************************************************************/

        stage('Verify Build Agent') {
            steps {
                sh """
                    set -eu

                    echo "========================================"
                    echo "VERIFY BUILD AGENT"
                    echo "========================================"

                    echo "Hostname : \$(hostname)"
                    echo "User     : \$(whoami)"
                    echo "Home     : \$HOME"
                    echo "Workspace: \$WORKSPACE"

                    podman info --format "Rootless={{.Host.Security.Rootless}}"
                """
            }
        }

        /**********************************************************************
         * Build Static Website
         *
         * Menjalankan Hugo di dalam Container menggunakan Workspace
         * Jenkins sebagai source code.
         **********************************************************************/

        stage('Build Static Website') {

            steps {

                sh """
                    set -eu

                    podman run \\
                        --userns=keep-id \\
                        --rm \\
                        --pull=missing \\
                        -v "\$WORKSPACE:/src:Z" \\
                        -w /src \\
                        ${HUGO_IMAGE} \\
                        --minify --destination public
                """

            }

        }

        /**********************************************************************
         * Package Artifact
         *
         * Mengemas hasil build menjadi satu file artifact.
         **********************************************************************/

        stage('Package Artifact') {

            steps {

                sh """
                    set -eu

                    tar czf "${ARTIFACT_NAME}" public

                    echo
                    echo "========================================"
                    echo "Artifact"
                    echo "========================================"

                    ls -lh "${ARTIFACT_NAME}"
                """

            }

        }

        /**********************************************************************
         * Publish Artifact
         *
         * Mengunggah Build Artifact ke MinIO menggunakan
         * MinIO Client Container.
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

                        podman run \
                            --rm \
                            -v "$WORKSPACE:/workspace:Z" \
                            -w /workspace \
                            "${MC_IMAGE}" \
                            mc alias set "${MINIO_ALIAS}" "${MINIO_URL}" "$MINIO_USER" "$MINIO_PASSWORD"

                        podman run \
                            --rm \
                            -v "$WORKSPACE:/workspace:Z" \
                            -w /workspace \
                            "${MC_IMAGE}" \
                            mc cp "${ARTIFACT_NAME}" "${MINIO_ALIAS}/${MINIO_BUCKET}/${ARTIFACT_NAME}"

                        podman run \
                            --rm \
                            -v "$WORKSPACE:/workspace:Z" \
                            -w /workspace \
                            "${MC_IMAGE}" \
                            mc ls "${MINIO_ALIAS}/${MINIO_BUCKET}"
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
