{{- define "simlab-web.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "simlab-web.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "simlab-web.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "simlab-web.labels" -}}
app.kubernetes.io/name: {{ include "simlab-web.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: autoscale-platform
{{- end -}}

{{- define "simlab-web.selectorLabels" -}}
app.kubernetes.io/name: {{ include "simlab-web.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "simlab-web.apiHost" -}}
{{- if .Values.api.host -}}
{{- .Values.api.host -}}
{{- else -}}
{{- printf "%s-simlab-api" .Release.Name -}}
{{- end -}}
{{- end -}}
