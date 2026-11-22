#!/usr/bin/env python3
import argparse
import os

SERVICES_XML = '''<?xml version="1.0" encoding="utf-8" ?>
<services version="1.0">
  <container id="default" version="1.0">
    <search />
    <document-api />
    <nodes>
      <node hostalias="node1" />
    </nodes>
  </container>

  <content id="content" version="1.0">
    <redundancy>1</redundancy>
    <documents>
      <document type="article" mode="index" />
    </documents>
    <nodes>
      <node hostalias="node1" distribution-key="0" />
    </nodes>
  </content>
</services>
'''

ARTICLE_SD = '''schema article {
  document article {
    field id type string {
      indexing: summary | attribute
    }
    field title type string {
      indexing: summary | index
      index: enable-bm25
    }
    field body type string {
      indexing: summary | index
      index: enable-bm25
    }
    field embedding type tensor<float>(x[384]) {
      indexing: attribute | index
      attribute {
        distance-metric: angular
      }
      index {
        hnsw {
          max-links-per-node: 16
          neighbors-to-explore-at-insert: 100
        }
      }
    }
  }

  fieldset default {
    fields: title, body
  }

  rank-profile bm25 {
    first-phase {
      expression: bm25(title) + bm25(body)
    }
  }

  rank-profile semantic {
    first-phase {
      expression: closeness(field, embedding)
    }
  }

  rank-profile hybrid {
    first-phase {
      expression: 0.3 * (bm25(title) + bm25(body)) + 0.7 * closeness(field, embedding)
    }
  }
}
'''

def main():
    parser = argparse.ArgumentParser(description="Scaffold minimal Vespa hybrid search application package")
    parser.add_argument("--output-dir", default="vespa-app", help="Output directory for application package")
    args = parser.parse_args()
    
    schemas_dir = os.path.join(args.output_dir, "schemas")
    os.makedirs(schemas_dir, exist_ok=True)
    
    with open(os.path.join(args.output_dir, "services.xml"), "w", encoding="utf-8") as f:
        f.write(SERVICES_XML)
    
    with open(os.path.join(schemas_dir, "article.sd"), "w", encoding="utf-8") as f:
        f.write(ARTICLE_SD)
        
    print(f"Scaffolded Vespa application package in: {args.output_dir}")

if __name__ == '__main__':
    main()
