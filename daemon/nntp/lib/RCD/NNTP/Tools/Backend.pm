#
#   Copyright © 2009, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Tools::Backend;

    #
    #   Backend connector
    #

    use strict;
    use PHP::Serialization qw(serialize unserialize);
    use LWP::UserAgent;
    use Time::HiRes qw(gettimeofday tv_interval);
    use HTML::Entities qw(decode_entities);
    use MIME::Base64 qw(encode_base64);
    use Wildev::AppServer::Toolkit;
    use RCD::NNTP::Base::Plugin qw(cache dbi check_dbi uuid client cnf);

    our $VERSION = "0.04"; # $Date: 2009/08/12 14:38:48 $


    sub new
    {
      my $class = shift;
      my $ref   = ref( $_[0] ) ? $_[0] : { @_ };
      my $obj   = bless $ref => $class;

      $obj->init();

      $obj;
    }


    sub init
    {
      my $self = shift;

      $self->{Toolkit} = Wildev::AppServer::Toolkit->instance();

      $self->{ua} = LWP::UserAgent->new(
          agent   => $self->{UserAgent}   || __PACKAGE__,
          timeout => $self->{ConnTimeout} || 5,
        );

      #
      #   For testing purpose of gate only
      #   while forum mainly closed for customers
      #

      if( $self->{TestUserId} && $self->{TestPassword} )
      {
        $self->{ua}->default_header(
          'Cookie' => 'bbuserid='   . $self->{TestUserId}   . ';' . ' ' .
                      'bbpassword=' . $self->{TestPassword} . ';'
        );
      }

      #
      #   Only this commands always will be handled by external program.
      #   Others will be handled internaly if applicable and externaly
      #   otherwise.
      #

      $self->{ExternalCommands} =
        $self->{Toolkit}->Config->Get( 'backend.Commands' );

      #
      #   Current connection id
      #

      $self->{uuid} = undef;
    }


    #
    #   Execute given command on backend (internal or remote) and return
    #   result. Result depends on command, this could be scalar, array or hash.
    #
    #   Input parameters:
    #     hash with command name and its named parameters
    #

    sub do
    {
      my $self = shift;
      my $form = shift;

      #
      #   Just return unless handler name specified
      #

      return undef
        unless $form->{do};

      my $result = undef;

      #
      #   Check for handler type: internal (1) / external (0)
      #   Default is internal (1)
      #

      my $inthandler = 1;

      #
      #   Is $form->{do} command should be handled by external program?
      #

      $inthandler = 0
        if scalar( grep { $_ eq $form->{do} } @{ $self->{ExternalCommands} } );

      #
      #   Is internal handler exists?
      #   $intcommand - internal sub program name
      #

      my $intcommand = 'cmd_' . $form->{do};

      $inthandler = 0
        if $inthandler && !defined &{ __PACKAGE__ . '::' . $intcommand };


      #
      #   Start command processing
      #

      my $reqstarttime = [ gettimeofday() ];

      if( $inthandler )
      {
        #
        #   First of all check for alive DB connection
        #

        $self->check_dbi              # check
          || $self->dbi               # try to connect if broken
          || die "DB not connected";  # die with error message if still failed

        #
        #   Now handle request
        #

        $result = $self->$intcommand( $form );
      }
      else
      {
        if( exists( $form->{sdata} ) )
        {
          #
          #   PHP like data serialization
          #

          $form->{sdata} = serialize( $form->{sdata} );
        }

        {
          #
          #   Add required frontend auth key
          #
  
          $form->{nntp_auth_key} = $self->{AuthKey};
        }

        my $response = $self->{ua}->post( $self->{URL}, Content => $form );

        if( $response->is_success )
        {
          my $content = $response->decoded_content;
  
          $self->{Toolkit}->Logger->debug(
              'Backend responce: ' . $content
            );
  
          if( $content =~ s/^\(serialized\)//i )
          {
            my $data = undef;
  
            eval { $data = unserialize( $content ) };
  
            $result = $@ ? undef : $data;
          }
          else
          {
            $result = $content;
          }
        }
      }

      my $elapsedtime  = tv_interval( $reqstarttime );

      $self->{Toolkit}->Logger->info(
          'Backend respond elapsed time, seconds: ' . $elapsedtime
        );

      return $result;
    }


    # --------------------------------------------------------------------------
    #
    #   Internal handlers
    #


    #
    #   Groups list
    #

    sub cmd_groupslist
    {
      my $self = shift;
      my $data = shift;

      my $groups = [];

      if(    exists( $data->{sdata}->{date} )
          && ref( $data->{sdata}->{date} ) eq 'HASH' )
      {
        #
        #   Return error 'command syntax error' to save request parameters
        #   to investigate them.
        #

        $self->{Toolkit}->Logger->error(
            'Groupslist: Command syntax error'
          );

        return 'command syntax error';
      }

      my $groupstmp    = {};
      my $groupssorted = [];
      my $tableprefix  = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );
      my $i = 0;

      #
      #   Get list of all groups
      #

      my $sth = $self->dbi->prepare( q{
          SELECT
            G.*,
            MIN( I.`messageid` ) + 0 AS 'min',
            MAX( I.`messageid` ) + 0 AS 'max'
          FROM
                      `} . $tableprefix . q{nntp_groups` AS G
            LEFT JOIN `} . $tableprefix . q{nntp_index`  AS I ON( G.`id` = I.`groupid` )
          WHERE
                G.`id` IN(} . join( ',', @{ $self->client->{groupslist} } ) . q{)
            AND G.`is_active` = 'yes'
            AND G.`map_id`    = 0
          GROUP BY
            I.`groupid`
          ORDER BY
            G.`group_name`
        } );

      $sth->execute();

      while( my $group = $sth->fetchrow_hashref() )
      {
        if( $group->{min} == $group->{max} )
        {
          $group->{min} = $group->{min} > 0 ? -- $group->{min} : 0;
          $group->{max} = $group->{min};
        }

        my $groupinfo = {
            'id'    => $group->{id}         ,
            'name'  => $group->{group_name} ,
            'first' => $group->{min}        ,
            'last'  => $group->{max}        ,
            'post'  => 'n'                  ,
            'i'     => $i++                 ,
          };

        push @{ $groupssorted }, $group->{id};
        $groupstmp->{ $group->{id} } = $groupinfo;
      }

      $sth->finish();


      #
      #   Get list of groups with not deleted messages
      #

      $sth = $self->dbi->prepare( q{
          SELECT
            G.*,
            MIN( I.`messageid` ) + 0 AS 'min',
            MAX( I.`messageid` ) + 0 AS 'max'
          FROM
                      `} . $tableprefix . q{nntp_groups` AS G
            LEFT JOIN `} . $tableprefix . q{nntp_index`  AS I ON( G.`id` = I.`groupid` )
          WHERE
                G.`id` IN(} . join( ',', @{ $self->client->{groupslist} } ) . q{)
            AND G.`is_active` = 'yes'
            AND G.`map_id`    = 0
            AND I.`deleted`   = 'no'
          GROUP BY
            I.`groupid`
          ORDER BY
            G.`group_name`
        } );

      $sth->execute();

      while( my $group = $sth->fetchrow_hashref() )
      {
        $groupstmp->{ $group->{id} }->{first} = $group->{min};
        $groupstmp->{ $group->{id} }->{last}  = $group->{max};
      }

      $sth->finish();


      #
      #   Build sorted groups list array
      #

      foreach my $groupid ( @{ $groupssorted } )
      {
        push @{ $groups }, $groupstmp->{ $groupid };
      }

      $groups;
    }


    #
    #   Group info
    #

    sub cmd_groupinfo
    {
      my $self = shift;
      my $data = shift;

      my $groupinfo = 'no such news group';

      return $groupinfo
        unless 0 + $data->{groupid};

      #
      #   Verify if access to this group is granted to user
      #

      return $groupinfo
        unless $self->client()->{groupids}->{ $data->{groupid} };

      my $tableprefix = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );

      #
      #   Info WITH deleted messages
      #

      my $WDeleted = $self->dbi->selectrow_hashref( q{
          SELECT
            MAX( `messageid` )   AS 'max',
            MIN( `messageid` )   AS 'min'
          FROM
            `} . $tableprefix . q{nntp_index`
          WHERE
            `groupid` = ?
          },
          undef,
          $data->{groupid},
        );

      #
      #   Info W/O deleted messages
      #

      my $WODeleted = $self->dbi->selectrow_hashref( q{
          SELECT
            MAX( `messageid` )   AS 'max'  ,
            MIN( `messageid` )   AS 'min'  ,
            COUNT( `messageid` ) AS 'count'
          FROM
            `} . $tableprefix . q{nntp_index`
          WHERE
                `groupid` = ?
            AND `deleted` = ?
          },
          undef,
          $data->{groupid},
          'no'
        );

      if(    $WDeleted  && ref( $WDeleted  ) eq 'HASH'
          && $WODeleted && ref( $WODeleted ) eq 'HASH' )
      {
        $WODeleted->{count} += 0;
        $WODeleted->{min}   += 0;
        $WODeleted->{max}   += 0;

        $WDeleted->{min} --;
        $WDeleted->{max} --;

        my $min =
          $WODeleted->{min} > $WDeleted->{min}
            ? $WODeleted->{min}
            : $WDeleted->{min};

        my $max =
          $WODeleted->{max} > $WDeleted->{max}
            ? $WODeleted->{max}
            : $WDeleted->{max};

        my $count = $WODeleted->{count};

        $groupinfo = {
            id    => $data->{groupid}   ,
            name  => $data->{group_name},
            first => $min               ,
            last  => $max               ,
            count => $count             ,
          };
      }

      $groupinfo;
    }


    #
    #   Xover
    #

    sub cmd_xover
    {
      my $self = shift;
      my $data = shift;

      my $anounces    = [];
      my $matchrules  = '';
      my $group;

      if   ( $data->{messageid} > 0 )
      {
        # just one defined message
        $matchrules = 
          '`messageid` = ' . ( 0 + $data->{messageid} );
      }
      elsif( $data->{messagefrom} && $data->{messageto} )
      {
        # messages in range from-to
        $matchrules =
          '`messageid` >= ' . ( 0 + $data->{messagefrom} ) . ' AND '.
          '`messageid` <= ' . ( 0 + $data->{messageto}   );
      }
      elsif( $data->{messagefrom} )
      {
        # messages from to the very end
        $matchrules =
          '`messageid` >= ' . ( 0 + $data->{messagefrom} );
      }

      my $tableprefix = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );

      my $sth = $self->dbi->prepare( q{
          SELECT
            `Index`.`title`       AS `title`     ,
            `Index`.`groupid`     AS `groupid`   ,
            `Index`.`messageid`   AS `messageid` ,
            `Index`.`refid`       AS `refid`     ,
            `Group`.`group_name`  AS `groupname` ,
            `User`.`username`     AS `username`  ,
            DATE_FORMAT(
              CONVERT_TZ(
                `Index`.`datetime`,
                'SYSTEM',
                '+00:00'
              ),
              '%a, %d %b %Y %T +00:00'
            )                     AS `gmdate`
          FROM
                      `} . $tableprefix . q{nntp_index`  AS `Index`
            LEFT JOIN `} . $tableprefix . q{nntp_groups` AS `Group`
              ON( `Index`.`groupid` = `Group`.`id`    )
            LEFT JOIN `} . $tableprefix . q{user`            AS `User`
              ON( `Index`.`userid`  = `User`.`userid` )
          WHERE
                `Index`.`groupid` = ?
            AND `Index`.`deleted` = ?
            AND } . $matchrules
        );

      $sth->execute( $data->{groupid}, 'no' );

      while( my $info = $sth->fetchrow_hashref() )
      {
        my $from    = $self->_build_from_address( $info->{username} );
        my $subject = $self->_build_subject( $info->{title} );

        my $anounce = {
            'messageid' => $info->{messageid} ,
            'refid'     => $info->{refid}     ,
            'groupid'   => $info->{groupid}   ,
            'groupname' => $info->{groupname} ,
            'gateid'    => $self->{Toolkit}->Config->Get( 'backend.GeteID' ),
            'subject'   => $subject           ,
            'from'      => $from              ,
            'date'      => $info->{gmdate}    ,
          };

        push @{$anounces}, $anounce;
      }

      $sth->finish();

      $anounces;
    }


    #
    #   Article
    #

    sub cmd_article
    {
      my $self = shift;
      my $data = shift;
      my $uuid = $self->uuid;

      my $message;

      if( $data->{messageid} > 0 && $data->{groupid} > 0 )
      {
        my $tableprefix = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );

        my $res = $self->dbi->selectrow_hashref( q{
              SELECT
                `CM`.`groupid`        ,
                `CM`.`messageid`      ,
                `CM`.`body`           ,
                `User`.`username`     ,
                `Index`.`refid`       ,
                `Index`.`postid`      ,
                `Index`.`title` AS subject,
                DATE_FORMAT(
                  CONVERT_TZ(
                    `Index`.`datetime`,
                    'SYSTEM',
                    '+00:00'
                  ),
                  '%a, %d %b %Y %T +00:00'
                )               AS `gmdate`
              FROM
                          `} . $tableprefix . q{nntp_cache_messages` AS `CM`
                LEFT JOIN `} . $tableprefix . q{nntp_index`          AS `Index`
                  ON(     `CM`.`groupid`   = `Index`.`groupid`
                      AND `CM`.`messageid` = `Index`.`messageid` )
                LEFT JOIN `} . $tableprefix . q{user`                AS `User`
                  ON( `Index`.`userid`  = `User`.`userid` )
              WHERE
                `CM`.`groupid`   = ? AND
                `CM`.`messageid` = ?
            },
            undef,
            $data->{groupid}  ,
            $data->{messageid},
          );

        if( $res
            && ref( $res ) eq 'HASH'
            && $res->{messageid} == $data->{messageid} )
        {
          #
          #   Message found in the cache
          #

          $self->{Toolkit}->Logger->debug(
              'Message '
              . $data->{groupid} . '.' . $data->{messageid}
              . ' found in cache'
            );

          my $from    = $self->_build_from_address( $res->{username} );
          my $subject = $self->_build_subject( $res->{subject} );

          my $gateid  = $self->{Toolkit}->Config->Get( 'backend.GeteID'  );
          my $charset = $self->{Toolkit}->Config->Get( 'backend.Charset' );

          my $contenttype =
            $self->{Toolkit}->Config->Get( 'backend.ContentType' )
            . '; charset="' . $charset . '"';

          # get group named by its id
          my $newsgroup =
            $self->client( $uuid )->{groupids}->{ $data->{groupid} }->{name};

          $message = {
              headers   => {
                  'Charset'      => $charset        ,
                  'Content-Type' => $contenttype    ,
                  'Subject'      => $subject        ,
                  'From'         => $from           ,
                  'Newsgroups'   => $newsgroup      ,
                  'Date'         => $res->{gmdate}  ,
                },
              body        => $res->{body}     ,
              charset     => $charset,
              gateid      => $gateid,
              groupid     => $data->{groupid} ,
              messageid   => $res->{messageid},
              refid       => $res->{refid}    ,
              postid      => $res->{postid}   ,

              #
              #   This prevents caller (ARTICLE.pm) of try to cache message
              #   second time: the message is allready cached.
              #
              #   This flag usually equals 0 only with remote backend server.
              #

              nocache   => 1,
            };
        }
      }

      if( !$message || ref( $message ) ne 'HASH' )
      {
        $self->{Toolkit}->Logger->debug(
            'Message '
            . $data->{groupid} . '.' . $data->{messageid}
            . ' not found'
          );

        $message = 'no such article';
      }

      $message;
    }


    #
    #   Prepare "From" address: this contains username encoded with Base64
    #   and plain email address
    #

    sub _build_from_address
    {
      my $self     = shift;
      my $username = shift;

      $username =~ s{"}{\"}g;

      my $from =
          '=?UTF-8?B?'
        . encode_base64( '"' . decode_entities( $username ) . '"', '' )
        . '?='
        . (
            length( $self->{Toolkit}->Config->Get( 'backend.FromAddress' ) )
              ? ' <'
                . $self->{Toolkit}->Config->Get( 'backend.FromAddress' )
                . '>'
              : ''
          );

      $from;
    }


    #
    #   Prepare message subject: encoded with Base64
    #

    sub _build_subject
    {
      my $self  = shift;
      my $title = shift;

      my $subject =
          '=?UTF-8?B?'
        . encode_base64( decode_entities( $title ), '' )
        . '?=';

      $subject;
    }


# end of the RCD::NNTP::Tools::Backend package

1;
