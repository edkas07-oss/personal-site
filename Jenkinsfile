/*
===============================================================================
Project : Personal Site
File    : Jenkinsfile

Description
-----------
CI Pipeline untuk membangun static website menggunakan Containerized Build
Environment.

Pipeline menerapkan prinsip:

- Pipeline as Code
- Stage-Based CI Pipeline
- Containerized Pipeline Environment
- Build Once, Deploy Many

Pipeline Workflow
-----------------

Checkout Source Code
        │
        ▼
Verify Build Environment
        │
        ▼
Build Static Website
        │
        ▼
Package Artifact
        │
        ▼
Publish Artifact
        │
        ▼
SUCCESS

===============================================================================
*/

pipeline {

    agent any

    /*
    ---------------------------------------------------------------------------
    Pipeline Options
    ---------------------------------------------------------------------------

    timestamps()
        Menambahkan timestamp pada setiap log sehingga memudahkan proses
        troubleshooting dan audit pipeline.
    */

    options {

        timestamps()

    }

    /*
    ---------------------------------------------------------------------------
    Environment Variables
    ---------------------------------------------------------------------------

    Seluruh konfigurasi pipeline ditempatkan pada satu lokasi agar mudah
    dikelola dan digunakan kembali.

    HUGO_IMAGE
        Image Hugo yang digunakan untuk membangun static website.

    MC_IMAGE
        Image MinIO Client yang digunakan untuk mengunggah Build Artifact.

    MINIO_ENDPOINT
        Endpoint MinIO Artifact Storage.

    ARTIFACT_BUCKET
        Bucket tujuan penyimpanan Build Artifact.

    PROJECT_NAME
        Nama project.

    ARTIFACT_NAME
        Nama Build Artifact yang dihasilkan pada setiap build.
    */

    environment {

        HUGO_IMAGE = 'klakegg/hugo:ext-alpine'

        MC_IMAGE = 'quay.io/minio/mc:latest'

        MINIO_ENDPOINT = 'http://host.containers.internal:9000'

        ARTIFACT_BUCKET = 'personal-site'

        PROJECT_NAME = 'personal-site'

        ARTIFACT_NAME = "${PROJECT_NAME}-${BUILD_NUMBER}.tar.gz"

    }

    stages {

        /*
        -----------------------------------------------------------------------
        Checkout Source Code

        Mengambil source code dari Git Repository ke Jenkins Workspace.
        Seluruh stage berikutnya menggunakan Workspace yang sama.
        -----------------------------------------------------------------------
        */

        stage('Checkout Source Code') {

            steps {

                checkout scm

            }

        }

        /*
        -----------------------------------------------------------------------
        Verify Build Environment

        Memastikan Container Runtime tersedia sebelum Build Pipeline dijalankan.

        Tahap ini merupakan validasi awal agar kegagalan akibat environment dapat
        diketahui sebelum proses build dimulai.
        -----------------------------------------------------------------------
        */

        stage('Verify Build Environment') {

            steps {

                sh '''
                    set -euo pipefail

                    echo
                    echo "========================================"
                    echo "Build Environment"
                    echo "========================================"
                    echo

                    podman --version
                '''

            }

        }

        /*
        -----------------------------------------------------------------------
        Build Static Website

        Menjalankan Hugo menggunakan Build Container.

        Jenkins Controller tidak menginstal Hugo secara langsung.

        Build dilakukan menggunakan Container Runtime (Podman) sesuai
        PS-ADR-0007.
        -----------------------------------------------------------------------
        */

        stage('Build Static Website') {

            steps {

                sh '''
                    set -euo pipefail

                    podman run \
                        --rm \
                        --name "hugo-build-${BUILD_NUMBER}" \
                        --pull=missing \
                        -u "$(id -u):$(id -g)" \
                        -e HUGO_CACHEDIR=/tmp \
                        -v "$WORKSPACE:/src:Z" \
                        -w /src \
                        ${HUGO_IMAGE} \
                        hugo \
                            --minify \
                            --destination public
                '''

            }

        }

        /*
        -----------------------------------------------------------------------
        Package Artifact

        Mengemas hasil build menjadi satu file artifact.

        Artifact digunakan sebagai output resmi CI Pipeline dan akan
        dipublikasikan ke Artifact Storage.
        -----------------------------------------------------------------------
        */

        stage('Package Artifact') {

            steps {

                sh '''
                    set -euo pipefail

                    tar czf "${ARTIFACT_NAME}" public

                    echo
                    echo "========================================"
                    echo "Artifact"
                    echo "========================================"
                    echo

                    ls -lh "${ARTIFACT_NAME}"

                    echo
                '''

            }

        }

        /*
        -----------------------------------------------------------------------
        Publish Artifact

        Mengunggah Build Artifact ke MinIO.

        MinIO Client dijalankan sebagai ephemeral container sehingga Jenkins
        Controller tidak perlu menginstal tool tambahan.
        -----------------------------------------------------------------------
        */

        stage('Publish Artifact') {

            steps {

                withCredentials([
                    usernamePassword(
                        credentialsId: 'MINIO_CREDENTIAL',
                        usernameVariable: 'MINIO_ACCESS_KEY',
                        passwordVariable: 'MINIO_SECRET_KEY'
                    )
                ]) {

                    sh '''
                        set -euo pipefail

                        echo
                        echo "========================================"
                        echo "Publish Artifact"
                        echo "========================================"
                        echo

                        echo "Artifact : ${ARTIFACT_NAME}"
                        echo "Bucket   : ${ARTIFACT_BUCKET}"

                        echo

                        podman run \
                            --rm \
                            --name "mc-${BUILD_NUMBER}" \
                            -v "$WORKSPACE:/workspace:Z" \
                            ${MC_IMAGE} \
                            sh -c "
                                mc alias set minio \
                                    ${MINIO_ENDPOINT} \
                                    ${MINIO_ACCESS_KEY} \
                                    ${MINIO_SECRET_KEY}

                                mc cp \
                                    /workspace/${ARTIFACT_NAME} \
                                    minio/${ARTIFACT_BUCKET}/

                                mc ls \
                                    minio/${ARTIFACT_BUCKET}/
                            "

                        echo
                        echo "========================================"
                        echo "Artifact published successfully."
                        echo "========================================"
                        echo

                    '''

                }

            }

        }

    }

    /*
    ---------------------------------------------------------------------------
    Post Actions

    Menampilkan status akhir pipeline.

    Bagian ini dapat dikembangkan untuk kebutuhan notifikasi seperti:

    - Microsoft Teams
    - Email
    - Slack
    - Telegram
    ---------------------------------------------------------------------------
    */

    post {

        success {

            echo 'Pipeline completed successfully.'

        }

        failure {

            echo 'Pipeline failed.'

        }

    }

}