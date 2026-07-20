export interface SteeringFileRecord {
  relpath: string
  size_bytes: number
  nonempty: boolean
}

export interface SteeringFilesResult {
  has_content: boolean
  file_count: number
  main: SteeringFileRecord | null
  fragments: SteeringFileRecord[]
}

export interface SteeringScaffoldResult extends SteeringFilesResult {
  created: string[]
}
