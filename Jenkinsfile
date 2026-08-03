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
                sh 'hugo'
            }
        }

        stage('Archive Build Artifact') {
            steps {
                archiveArtifacts artifacts: 'public/**', fingerprint: true
            }
        }

    }

}
